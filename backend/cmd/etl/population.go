package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/unicode/norm"
)

// runPopulation 은 제주 250m 격자 유동인구(성연령별 제주도민, 월 전체)를 H3 셀별로 합쳐 cell_population 에 넣고
// 최종 위험도를 다시 계산한다. 250m 격자 중심 좌표(EPSG:5179)를 PostGIS 로 위경도 변환해 셀에 매칭한다.
//
//	go run ./cmd/etl population "<제주특별자치도_성연령별_제주도민_250그리드단위_유동인구현황_… 폴더>"
//
// 폴더 안에서 쓰는 파일: 250m격자기준좌표.csv, 이름에 "유동인구_비율포함_" 이 있고 평일·휴일 구분이 없는 월 전체 파일.
func runPopulation(ctx context.Context, pool *pgxpool.Pool, dir string) error {
	coords, err := readKoreanCSV(filepath.Join(dir, "250m격자기준좌표.csv"))
	if err != nil {
		return err
	}
	popPath, err := findTotalPopulationFile(dir)
	if err != nil {
		return err
	}
	pops, err := readKoreanCSV(popPath)
	if err != nil {
		return err
	}

	// 250m 격자 ID → 중심 좌표 (X, Y, ID)
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

	// 유동인구: [기준년월, 격자ID, 남10..남60, 여10..여60 (12개), 비율 12개, 기준일자]
	var src [][]any
	stdYM := ""
	noCoord := 0
	for _, r := range pops[1:] {
		if len(r) < 14 {
			continue
		}
		p, ok := xy[r[1]]
		if !ok {
			noCoord++
			continue
		}
		total := 0.0
		for _, v := range r[2:14] {
			f, err := strconv.ParseFloat(v, 64)
			if err != nil {
				return fmt.Errorf("유동인구 %s 형식 오류 %q", r[1], v)
			}
			total += f
		}
		stdYM = r[0]
		src = append(src, []any{p[0], p[1], total})
	}
	source := fmt.Sprintf("%s 제주도민 250m 격자 유동인구 (성연령 합계, %s)", stdYM, filepath.Base(popPath))

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `CREATE TEMP TABLE pop250 (x float8, y float8, pop float8) ON COMMIT DROP`); err != nil {
		return err
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"pop250"}, []string{"x", "y", "pop"}, pgx.CopyFromRows(src)); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `TRUNCATE cell_population`); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO cell_population (h3_index, population, n_250m, source)
		SELECT c.h3_index, sum(p.pop), count(*), $1
		FROM pop250 p
		JOIN h3_cell c ON ST_Contains(c.geom, ST_Transform(ST_SetSRID(ST_MakePoint(p.x, p.y), 5179), 4326))
		GROUP BY c.h3_index`, source)
	if err != nil {
		return err
	}
	var matched int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(sum(n_250m), 0) FROM cell_population`).Scan(&matched); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	log.Printf("population: 250m 격자 %d개 중 좌표 없음 %d, 격자 밖 %d → 인구 있는 셀 %d개 (%s)",
		len(pops)-1, noCoord, len(src)-matched, tag.RowsAffected(), source)
	return runCombine(ctx, pool)
}

// findTotalPopulationFile 은 평일·휴일 등으로 나뉘지 않은 월 전체 유동인구 파일을 찾는다.
func findTotalPopulationFile(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	var found []string
	for _, e := range entries {
		n := norm.NFC.String(e.Name()) // macOS 는 한글 파일 이름을 NFD(자모 분리)로 돌려줄 수 있다
		if strings.HasSuffix(n, ".csv") && strings.Contains(n, "유동인구_비율포함_") &&
			!strings.Contains(n, "평일") && !strings.Contains(n, "휴일") {
			found = append(found, filepath.Join(dir, e.Name()))
		}
	}
	if len(found) != 1 {
		return "", fmt.Errorf("%s 에서 월 전체 유동인구 파일을 하나로 특정할 수 없음: %v", dir, found)
	}
	return found[0], nil
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
