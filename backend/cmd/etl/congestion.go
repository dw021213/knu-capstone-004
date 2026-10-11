package main

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jejurisk/internal/geo"
)

const HotspotsPath = "data/test/congestion_hotspots.csv"

// runCongestionTest 는 핫스팟 CSV 로 가짜 혼잡도를 만들어 congestion(source='test')에 넣고 위험도를 다시 계산한다.
// clear=true 면 테스트 혼잡도만 지우고 위험도를 다시 계산한다.
func runCongestionTest(ctx context.Context, pool *pgxpool.Pool, clear bool) error {
	batch := &pgx.Batch{}
	batch.Queue(`DELETE FROM congestion WHERE source = 'test'`)
	n := 0
	if !clear {
		spots, err := readHotspots()
		if err != nil {
			return err
		}
		type cell struct {
			idx      string
			lat, lng float64
		}
		r, err := pool.Query(ctx, `SELECT h3_index, ST_Y(center), ST_X(center) FROM h3_cell`)
		if err != nil {
			return err
		}
		cells, err := pgx.CollectRows(r, func(row pgx.CollectableRow) (cell, error) {
			var c cell
			err := row.Scan(&c.idx, &c.lat, &c.lng)
			return c, err
		})
		if err != nil {
			return err
		}
		ts := time.Now().UTC().Truncate(time.Second)
		for _, c := range cells {
			if v := geo.CongestionAt(c.lat, c.lng, spots); v > 0 {
				batch.Queue(`INSERT INTO congestion (h3_index, ts, value, source) VALUES ($1, $2, $3, 'test')`,
					c.idx, ts, v)
				n++
			}
		}
		for _, s := range spots {
			log.Printf("congestion-test: 핫스팟 %s (%.4f, %.4f) sigma=%.0fm 강도=%.1f", s.Name, s.Lat, s.Lng, s.SigmaM, s.Intensity)
		}
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("congestion 적재: %w", err)
	}
	log.Printf("congestion-test: 혼잡 셀 %d개 (clear=%v)", n, clear)
	return runDummyRisk(ctx, pool)
}

func readHotspots() ([]geo.Hotspot, error) {
	rows, err := readCSV(HotspotsPath)
	if err != nil {
		return nil, err
	}
	var out []geo.Hotspot
	for _, r := range rows {
		var h geo.Hotspot
		var errs [4]error
		h.Name = r["name"]
		h.Lat, errs[0] = strconv.ParseFloat(r["lat"], 64)
		h.Lng, errs[1] = strconv.ParseFloat(r["lng"], 64)
		h.SigmaM, errs[2] = strconv.ParseFloat(r["sigma_m"], 64)
		h.Intensity, errs[3] = strconv.ParseFloat(r["intensity"], 64)
		for _, e := range errs {
			if e != nil {
				return nil, fmt.Errorf("%s 행 %q: %w", HotspotsPath, h.Name, e)
			}
		}
		out = append(out, h)
	}
	return out, nil
}
