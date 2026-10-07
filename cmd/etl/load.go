package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/paulmach/orb/encoding/wkt"
	"github.com/uber/h3-go/v4"

	"jejurisk/internal/geo"
)

// runGrid 는 제주 경계를 덮는 H3 res8 셀을 h3_cell 에 다시 채운다.
// 셀이 바뀌면 집계·위험도도 무효라서 CASCADE 로 함께 비운다.
func runGrid(ctx context.Context, pool *pgxpool.Pool) error {
	mp, err := geo.LoadBoundary(BoundaryPath, BoundaryKey, BoundaryValue)
	if err != nil {
		return err
	}
	cells, err := geo.PolygonToCells(mp, H3Res)
	if err != nil {
		return err
	}

	batch := &pgx.Batch{}
	batch.Queue(`TRUNCATE h3_cell CASCADE`)
	for _, c := range cells {
		poly, err := geo.CellPolygon(c)
		if err != nil {
			return err
		}
		center, err := geo.CellCenter(c)
		if err != nil {
			return err
		}
		batch.Queue(`INSERT INTO h3_cell (h3_index, geom, center)
			VALUES ($1, ST_GeomFromText($2, 4326), ST_GeomFromText($3, 4326))`,
			c.String(), wkt.MarshalString(poly), wkt.MarshalString(center))
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("grid 적재: %w", err)
	}
	log.Printf("grid: H3 res%d 셀 %d개 적재", H3Res, len(cells))
	return nil
}

// runFacilities 는 지오코딩된 CSV 를 facility 에 UPSERT 한다.
func runFacilities(ctx context.Context, pool *pgxpool.Pool) error {
	rows, err := readCSV(GeocodedPath)
	if err != nil {
		return fmt.Errorf("%w (먼저 `go run ./cmd/etl geocode`)", err)
	}
	batch := &pgx.Batch{}
	n, skipped := 0, 0
	for _, r := range rows {
		lat, err1 := strconv.ParseFloat(r["lat"], 64)
		lng, err2 := strconv.ParseFloat(r["lng"], 64)
		if err1 != nil || err2 != nil {
			log.Printf("facilities: 좌표 없음 → 건너뜀: %s", r["name"])
			skipped++
			continue
		}
		cell, err := h3.LatLngToCell(h3.NewLatLng(lat, lng), H3Res)
		if err != nil {
			return err
		}
		batch.Queue(`INSERT INTO facility (type, name, address, geom, h3_index)
			VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6)
			ON CONFLICT (type, name) DO UPDATE
			SET address = EXCLUDED.address, geom = EXCLUDED.geom, h3_index = EXCLUDED.h3_index`,
			r["type"], r["name"], r["address"], lng, lat, cell.String())
		n++
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("facility 적재: %w", err)
	}
	log.Printf("facilities: %d건 적재, %d건 건너뜀", n, skipped)
	return nil
}

// runStats 는 시설 type 별로 셀 내 개수, 인접 1링 포함 개수, 최근접 거리를 계산한다.
func runStats(ctx context.Context, pool *pgxpool.Pool) error {
	cells, err := queryStrings(ctx, pool, `SELECT h3_index FROM h3_cell`)
	if err != nil {
		return err
	}
	types, err := queryStrings(ctx, pool, `SELECT DISTINCT type FROM facility`)
	if err != nil {
		return err
	}

	batch := &pgx.Batch{}
	batch.Queue(`TRUNCATE cell_facility_stat`)
	for _, typ := range types {
		counts := map[string]int{}
		r, err := pool.Query(ctx,
			`SELECT h3_index, count(*) FROM facility WHERE type = $1 GROUP BY h3_index`, typ)
		if err != nil {
			return err
		}
		for r.Next() {
			var idx string
			var c int
			if err := r.Scan(&idx, &c); err != nil {
				return err
			}
			counts[idx] = c
		}
		if err := r.Err(); err != nil {
			return err
		}

		for _, idx := range cells {
			disk, err := h3.Cell(h3.IndexFromString(idx)).GridDisk(1)
			if err != nil {
				return err
			}
			k1 := 0
			for _, d := range disk {
				k1 += counts[d.String()]
			}
			batch.Queue(`INSERT INTO cell_facility_stat (h3_index, type, count_in_cell, count_k1)
				VALUES ($1, $2, $3, $4)`, idx, typ, counts[idx], k1)
		}
	}
	// 최근접 시설 거리: KNN(<->)으로 후보를 고르고 geography 로 미터 거리 계산
	batch.Queue(`
		UPDATE cell_facility_stat s
		SET nearest_dist_m = (
			SELECT ST_Distance(c.center::geography, f.geom::geography)
			FROM h3_cell c, facility f
			WHERE c.h3_index = s.h3_index AND f.type = s.type
			ORDER BY c.center <-> f.geom
			LIMIT 1)`)
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("stats 계산: %w", err)
	}
	log.Printf("stats: 셀 %d개 × 시설 유형 %d개", len(cells), len(types))
	return nil
}

// runDummyRisk 는 모델 완성 전까지 쓸 임의 위험도를 넣는다.
// 점수 = 최근접 119 거리 / 최대 거리 (노이즈 없음, 실행할 때마다 같은 결과).
// 119 에서 멀수록 높게 나오므로 지도에서 격자·시설 매핑이 맞는지 눈으로 검증할 수 있다.
func runDummyRisk(ctx context.Context, pool *pgxpool.Pool) error {
	r, err := pool.Query(ctx, `
		SELECT c.h3_index, COALESCE(s.nearest_dist_m, 0)
		FROM h3_cell c
		LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = $1`, FireStationTyp)
	if err != nil {
		return err
	}
	type row struct {
		idx  string
		dist float64
	}
	var rows []row
	maxDist := 0.0
	for r.Next() {
		var x row
		if err := r.Scan(&x.idx, &x.dist); err != nil {
			return err
		}
		maxDist = math.Max(maxDist, x.dist)
		rows = append(rows, x)
	}
	if err := r.Err(); err != nil {
		return err
	}
	if maxDist == 0 {
		maxDist = 1
	}

	ts := time.Now().UTC().Truncate(time.Second)
	batch := &pgx.Batch{}
	batch.Queue(`DELETE FROM risk_score WHERE source = 'dummy'`)
	for _, x := range rows {
		score := x.dist / maxDist
		level := int(math.Ceil(score * 5))
		level = max(1, min(5, level))
		batch.Queue(`INSERT INTO risk_score (h3_index, ts, score, level, source)
			VALUES ($1, $2, $3, $4, 'dummy')`, x.idx, ts, score, level)
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("dummy-risk 적재: %w", err)
	}
	log.Printf("dummy-risk: %d셀, ts=%s, 최대 최근접거리 %.0fm", len(rows), ts.Format(time.RFC3339), maxDist)
	return nil
}

func sendInTx(ctx context.Context, pool *pgxpool.Pool, batch *pgx.Batch) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := tx.SendBatch(ctx, batch).Close(); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func queryStrings(ctx context.Context, pool *pgxpool.Pool, sql string) ([]string, error) {
	r, err := pool.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(r, pgx.RowTo[string])
}
