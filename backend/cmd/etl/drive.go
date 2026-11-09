package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jejurisk/internal/geo"
	"jejurisk/migrations"
)

// 실제 도로 기준 주행시간 (OSRM).
//
// OSRM 은 계산할 때만 로컬에 띄운다(서버에는 필요 없음). 결과는 CSV 로 레포에 남기고 DB 에는 drive-apply 로 넣는다.
//
//	go run ./cmd/etl drive-time [OSRM 주소]   기본 http://127.0.0.1:5000 → CSV 작성 + 로컬 DB 반영
//	go run ./cmd/etl drive-apply              CSV → cell_facility_stat (운영 서버: docker compose exec server etl drive-apply)
//
// 시간 = OSRM 도로 주행시간(car 프로필, 막힘 없는 상태) + 도로가 먼 셀만 걷는 시간.
// 셀 중심에서 가장 가까운 도로까지(snap) walkFreeM 까지는 셀 안에 도로가 있는 것으로 보고 0, 넘는 만큼만 걷기 4km/h.
// (골든타임 7분은 도로상 현장 도착 기준이라 도심 셀에 걷는 시간을 붙이지 않는다.) 시설 쪽 snap 은 시간에 넣지 않는다.
// snap 이 maxSnapM 을 넘으면(추자도처럼 본섬 도로망과 이어지지 않은 섬 — OSRM 이 본섬 도로에 억지로 붙임)
// 도로로 닿지 않는 것으로 보고 CSV 에 남기지 않는다 → 직선 근사(drive_source=straight) 유지.
// 우도·가파도처럼 OSM 에 차량 여객선 항로가 있으면 배 시간이 포함된다(대기 시간 제외).
const (
	DriveCSVPath     = "data/processed/drive_time_osrm.csv"
	defaultOSRM      = "http://127.0.0.1:5000"
	walkMPerMin      = 4000.0 / 60
	walkFreeM        = 300  // res8 셀 중심 간격(약 0.8km)의 절반 남짓
	maxSnapM         = 3000 // 이보다 멀면 도로로 닿지 않는 셀
	osrmMaxCoords    = 2000 // 요청 1건의 좌표 수 상한(출발 + 도착). URL 길이를 적당히 유지
	driveCSVHeaderV1 = "h3_index,type,facility_name,drive_min,road_m,snap_m"
)

// 주행시간을 계산할 시설 유형 (CCTV 는 개수 기준이라 제외)
var driveTypes = []string{"fire_station", "er", "police", "convenience"}

type driveRow struct {
	h3, typ, name     string
	min, roadM, snapM float64
}

type pt struct {
	id, name string
	lng, lat float64
}

func runDriveTime(ctx context.Context, pool *pgxpool.Pool, osrm string) error {
	if osrm == "" {
		osrm = defaultOSRM
	}
	osrm = strings.TrimRight(osrm, "/")
	cells, err := queryPoints(ctx, pool, `SELECT h3_index, '', ST_X(center), ST_Y(center) FROM h3_cell ORDER BY h3_index`)
	if err != nil {
		return err
	}
	var out []driveRow
	for _, typ := range driveTypes {
		fac, err := queryPoints(ctx, pool, `SELECT id::text, name, ST_X(geom), ST_Y(geom) FROM facility WHERE type = $1 ORDER BY id`, typ)
		if err != nil {
			return err
		}
		if len(fac) == 0 {
			log.Printf("drive-time: %s 시설 없음, 건너뜀", typ)
			continue
		}
		chunk := osrmMaxCoords - len(fac)
		if chunk < 50 {
			return fmt.Errorf("%s 시설 %d곳: 요청 하나에 다 넣기엔 많음", typ, len(fac))
		}
		got, unreachable := 0, 0
		for i := 0; i < len(cells); i += chunk {
			src := cells[i:min(i+chunk, len(cells))]
			rows, err := osrmNearest(ctx, osrm, src, fac)
			if err != nil {
				return fmt.Errorf("%s: %w", typ, err)
			}
			for _, r := range rows {
				if r == nil {
					unreachable++
					continue
				}
				r.typ = typ
				out = append(out, *r)
				got++
			}
		}
		log.Printf("drive-time: %-12s 시설 %4d곳 → 셀 %d개 계산, 도로로 닿지 않음 %d개(직선 근사 유지)", typ, len(fac), got, unreachable)
	}
	if err := writeDriveCSV(out); err != nil {
		return err
	}
	log.Printf("drive-time: %s %d행", DriveCSVPath, len(out))
	return runDriveApply(ctx, pool)
}

// osrmNearest 는 src 각각에서 가장 빨리 닿는 fac 하나를 고른다. 닿는 시설이 없으면 nil.
func osrmNearest(ctx context.Context, base string, src, fac []pt) ([]*driveRow, error) {
	coords := make([]string, 0, len(src)+len(fac))
	for _, p := range append(append([]pt{}, src...), fac...) {
		coords = append(coords, strconv.FormatFloat(p.lng, 'f', 6, 64)+","+strconv.FormatFloat(p.lat, 'f', 6, 64))
	}
	idx := func(from, n int) string {
		s := make([]string, n)
		for i := range s {
			s[i] = strconv.Itoa(from + i)
		}
		return strings.Join(s, ";")
	}
	url := fmt.Sprintf("%s/table/v1/driving/%s?sources=%s&destinations=%s&annotations=duration,distance",
		base, strings.Join(coords, ";"), idx(0, len(src)), idx(len(src), len(fac)))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("OSRM 요청 실패(%s 가 떠 있는지 확인): %w", base, err)
	}
	defer resp.Body.Close()
	var t struct {
		Code      string                       `json:"code"`
		Message   string                       `json:"message"`
		Durations [][]*float64                 `json:"durations"`
		Distances [][]*float64                 `json:"distances"`
		Sources   []struct{ Distance float64 } `json:"sources"`
		Dests     []struct{ Distance float64 } `json:"destinations"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&t); err != nil {
		return nil, fmt.Errorf("OSRM 응답(%s): %w", resp.Status, err)
	}
	if t.Code != "Ok" || len(t.Durations) != len(src) || len(t.Dests) != len(fac) {
		return nil, fmt.Errorf("OSRM %s: %s", t.Code, t.Message)
	}
	res := make([]*driveRow, len(src))
	for i := range src {
		snap := t.Sources[i].Distance
		if snap > maxSnapM {
			continue
		}
		best := math.Inf(1)
		for j := range fac {
			d, m := t.Durations[i][j], t.Distances[i][j]
			if d == nil || m == nil {
				continue
			}
			total := *d/60 + math.Max(0, snap-walkFreeM)/walkMPerMin
			if total < best {
				best = total
				res[i] = &driveRow{h3: src[i].id, name: fac[j].name, min: total, roadM: *m, snapM: snap}
			}
		}
	}
	return res, nil
}

func writeDriveCSV(rows []driveRow) error {
	f, err := os.Create(DriveCSVPath)
	if err != nil {
		return err
	}
	w := csv.NewWriter(f)
	w.Write(strings.Split(driveCSVHeaderV1, ","))
	for _, r := range rows {
		w.Write([]string{r.h3, r.typ, r.name,
			strconv.FormatFloat(r.min, 'f', 2, 64),
			strconv.FormatFloat(r.roadM, 'f', 0, 64),
			strconv.FormatFloat(r.snapM, 'f', 0, 64)})
	}
	w.Flush()
	if err := w.Error(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// runDriveApply 는 CSV 의 도로 기준 주행시간으로 cell_facility_stat 을 덮어쓴다.
// CSV 에 적힌 최근접 시설이 지금 facility 에 없으면(시설 목록이 바뀜) 그 유형은 건너뛰고 직선 근사를 둔다 → drive-time 을 다시 돌릴 것.
// stats 를 다시 돌리면 직선 근사로 돌아가므로 stats 끝에서도 이 함수를 부른다.
func runDriveApply(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, migrations.DriveTimeOSRM); err != nil {
		return fmt.Errorf("014 스키마: %w", err)
	}
	f, err := os.Open(DriveCSVPath)
	if os.IsNotExist(err) {
		log.Printf("drive-apply: %s 없음 — 주행시간은 직선 근사(직선×1.3÷40km/h) 그대로", DriveCSVPath)
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()
	recs, err := csv.NewReader(f).ReadAll()
	if err != nil {
		return fmt.Errorf("%s: %w", DriveCSVPath, err)
	}
	if len(recs) == 0 || strings.Join(recs[0], ",") != driveCSVHeaderV1 {
		return fmt.Errorf("%s: 헤더가 %q 가 아님", DriveCSVPath, driveCSVHeaderV1)
	}
	byType := map[string][][]string{}
	for _, r := range recs[1:] {
		byType[r[1]] = append(byType[r[1]], r)
	}
	batch := &pgx.Batch{}
	batch.Queue(`UPDATE cell_facility_stat SET nearest_road_m = NULL, nearest_snap_m = NULL, nearest_name = NULL, drive_source = 'straight',
		nearest_drive_min = nearest_dist_m * $1 / $2`, geo.DriveDetour, geo.DriveSpeedKmh*1000/60)
	for typ, rows := range byType {
		names, err := queryStrings(ctx, pool, `SELECT name FROM facility WHERE type = '`+strings.ReplaceAll(typ, "'", "")+`'`)
		if err != nil {
			return err
		}
		have := map[string]bool{}
		for _, n := range names {
			have[n] = true
		}
		missing := ""
		for _, r := range rows {
			if !have[r[2]] {
				missing = r[2]
				break
			}
		}
		if missing != "" {
			log.Printf("drive-apply: ⚠️ %s — CSV 의 시설 %q 이(가) facility 에 없음. 시설 목록이 바뀌었으니 drive-time 을 다시 돌릴 것(이 유형은 직선 근사 유지)", typ, missing)
			continue
		}
		for _, r := range rows {
			var v [3]float64
			for k := range v {
				if v[k], err = strconv.ParseFloat(r[3+k], 64); err != nil {
					return fmt.Errorf("%s %s: %w", r[0], typ, err)
				}
			}
			batch.Queue(`UPDATE cell_facility_stat SET nearest_drive_min = $3, nearest_road_m = $4, nearest_snap_m = $5, nearest_name = $6, drive_source = 'osrm'
				WHERE h3_index = $1 AND type = $2`, r[0], typ, v[0], v[1], v[2], r[2])
		}
		log.Printf("drive-apply: %-12s %d셀 도로 기준", typ, len(rows))
	}
	return sendInTx(ctx, pool, batch)
}

func queryPoints(ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) ([]pt, error) {
	r, err := pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(r, func(row pgx.CollectableRow) (pt, error) {
		var p pt
		return p, row.Scan(&p.id, &p.name, &p.lng, &p.lat)
	})
}
