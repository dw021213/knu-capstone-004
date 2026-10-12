package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/unicode/norm"

	"jejurisk/internal/risk"
)

// runPopulation 은 제주 250m 격자 시간대별 유동인구(제주도민, 조건 8종 × 0~23시)를 H3 셀별로 합쳐
// cell_population_hourly 에 넣고 최종 위험도를 다시 계산한다.
// 250m 격자 중심 좌표(EPSG:5179)를 PostGIS 로 위경도 변환해 셀에 매칭한다.
//
//	go run ./cmd/etl population "<제주특별자치도_시간대별_제주도민_250그리드단위_유동인구현황_… 폴더>"
//
// 폴더 안의 250m격자기준좌표.csv 와 "…유동인구_비율포함_[조건_]YYYYMMDD.csv" 파일들(전체·평일·휴일·휴일전날·맑음·흐림·비·눈)을 쓴다.
func runPopulation(ctx context.Context, pool *pgxpool.Pool, dir string) error {
	coords, err := readKoreanCSV(filepath.Join(dir, "250m격자기준좌표.csv"))
	if err != nil {
		return err
	}
	xy := make(map[string][2]float64, len(coords))
	for _, r := range coords[1:] {
		if len(r) < 3 {
			continue
		}
		x, err1 := strconv.ParseFloat(r[0], 64)
		y, err2 := strconv.ParseFloat(r[1], 64)
		if err1 != nil || err2 != nil {
			return fmt.Errorf("좌표 파일 형식 오류: %v", r)
		}
		xy[r[2]] = [2]float64{x, y}
	}

	files, err := findHourlyPopulationFiles(dir)
	if err != nil {
		return err
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// 250m 격자 → H3 매핑을 한 번만 계산해 두고 조건별 파일에 재사용한다.
	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE g250 (id text PRIMARY KEY, x float8, y float8) ON COMMIT DROP;
		CREATE TEMP TABLE pop250 (condition text, id text, hour smallint, pop float8) ON COMMIT DROP;`); err != nil {
		return err
	}
	var gRows [][]any
	for id, p := range xy {
		gRows = append(gRows, []any{id, p[0], p[1]})
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"g250"}, []string{"id", "x", "y"}, pgx.CopyFromRows(gRows)); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE g250h3 ON COMMIT DROP AS
		SELECT g.id, c.h3_index FROM g250 g
		JOIN h3_cell c ON ST_Contains(c.geom, ST_Transform(ST_SetSRID(ST_MakePoint(g.x, g.y), 5179), 4326));
		CREATE INDEX ON g250h3 (id);`); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `TRUNCATE population_source CASCADE`); err != nil {
		return err
	}

	for _, cond := range risk.Conditions {
		path, ok := files[cond.Key]
		if !ok {
			return fmt.Errorf("%s 조건 파일 없음 (%s)", cond.Label, dir)
		}
		rows, err := readKoreanCSV(path)
		if err != nil {
			return err
		}
		// [기준년월, 격자ID, 00시..23시 유동인구 24개, 비율 24개, 기준일자]
		var src [][]any
		stdYM, noCoord := "", 0
		for _, r := range rows[1:] {
			if len(r) < 26 {
				continue
			}
			if _, ok := xy[r[1]]; !ok {
				noCoord++
				continue
			}
			stdYM = r[0]
			for h := 0; h < 24; h++ {
				v, err := strconv.ParseFloat(r[2+h], 64)
				if err != nil {
					return fmt.Errorf("%s %s %d시 형식 오류 %q", filepath.Base(path), r[1], h, r[2+h])
				}
				src = append(src, []any{cond.Key, r[1], int16(h), v})
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO population_source (condition, label, file, std_ym) VALUES ($1, $2, $3, $4)`,
			cond.Key, cond.Label, filepath.Base(path), stdYM); err != nil {
			return err
		}
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"pop250"}, []string{"condition", "id", "hour", "pop"}, pgx.CopyFromRows(src)); err != nil {
			return err
		}
		log.Printf("population: %s %s — 250m 격자 %d개 (좌표 없음 %d)", cond.Label, stdYM, len(rows)-1, noCoord)
	}

	tag, err := tx.Exec(ctx, `
		INSERT INTO cell_population_hourly (h3_index, condition, hour, population)
		SELECT m.h3_index, p.condition, p.hour, sum(p.pop) -- 여기선 월 합계, 아래에서 하루 평균으로 나눈다
		FROM pop250 p JOIN g250h3 m USING (id)
		GROUP BY m.h3_index, p.condition, p.hour`)
	if err != nil {
		return err
	}
	// 월 합계 → 하루 평균 (internal/risk Condition.Days 참고)
	var allTotal float64
	if err := tx.QueryRow(ctx, `SELECT sum(population) FROM cell_population_hourly WHERE condition = 'all'`).Scan(&allTotal); err != nil {
		return err
	}
	allPerDay := allTotal / risk.Conditions[0].Days
	for _, cond := range risk.Conditions {
		days, basis := cond.Days, "2015-01 달력 일수"
		if days == 0 {
			var total float64
			if err := tx.QueryRow(ctx, `SELECT sum(population) FROM cell_population_hourly WHERE condition = $1`, cond.Key).Scan(&total); err != nil {
				return err
			}
			days, basis = total/allPerDay, "일수 자료 없음: 섬 전체 하루 인구를 전체 조건과 같게 맞춘 환산 일수"
		}
		if _, err := tx.Exec(ctx, `UPDATE cell_population_hourly SET population = population / $2 WHERE condition = $1`, cond.Key, days); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE population_source SET days = $2, days_basis = $3 WHERE condition = $1`, cond.Key, days, basis); err != nil {
			return err
		}
		log.Printf("population: %s 하루 평균으로 환산 ÷ %.2f일 (%s)", cond.Label, days, basis)
	}

	var cells, unmatched int
	if err := tx.QueryRow(ctx, `
		SELECT (SELECT count(DISTINCT h3_index) FROM cell_population_hourly),
		       (SELECT count(DISTINCT p.id) FROM pop250 p LEFT JOIN g250h3 m USING (id) WHERE m.id IS NULL)`).
		Scan(&cells, &unmatched); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	log.Printf("population: %d행 (조건 %d × 24시간), 인구 있는 셀 %d개, 격자 밖 250m 격자 %d개",
		tag.RowsAffected(), len(risk.Conditions), cells, unmatched)
	return runCombine(ctx, pool)
}

// popFileRe 는 "…유동인구_비율포함_20150131.csv"(전체) 또는 "…유동인구_비율포함_평일_20150131.csv" 를 읽는다.
var popFileRe = regexp.MustCompile(`유동인구_비율포함_(?:(.+?)_)?\d{8}\.csv$`)

// findHourlyPopulationFiles 는 조건 key → 파일 경로를 돌려준다.
func findHourlyPopulationFiles(dir string) (map[string]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	byTag := map[string]string{}
	for _, e := range entries {
		name := norm.NFC.String(e.Name()) // macOS 는 한글 파일 이름을 NFD(자모 분리)로 돌려줄 수 있다
		if m := popFileRe.FindStringSubmatch(name); m != nil {
			byTag[m[1]] = filepath.Join(dir, e.Name())
		}
	}
	out := map[string]string{}
	for _, c := range risk.Conditions {
		if p, ok := byTag[c.FileTag]; ok {
			out[c.Key] = p
		}
	}
	return out, nil
}

// readKoreanCSV 는 UTF-8(BOM 포함) 또는 CP949 CSV 를 읽는다. 공공데이터 파일마다 인코딩이 달라서 자동 판별한다.
func readKoreanCSV(path string) ([][]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	raw = bytes.TrimPrefix(raw, []byte("\xef\xbb\xbf"))
	if !utf8.Valid(raw) {
		if raw, err = korean.EUCKR.NewDecoder().Bytes(raw); err != nil {
			return nil, fmt.Errorf("%s CP949 변환: %w", path, err)
		}
	}
	r := csv.NewReader(bytes.NewReader(raw))
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("%s: 빈 파일", path)
	}
	return rows, nil
}
