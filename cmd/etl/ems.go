package main

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/uber/h3-go/v4"

	"jejurisk/internal/geo"
)

// runEMS 는 제주소방안전본부 구급출동 현황 CSV 를 읽어 셀·연도별 출동 건수를 cell_ems_count 에 넣고
// 위험도를 다시 계산한다. 원본(환자 정보 포함)은 저장하지 않고 건수만 남긴다.
//
//	go run ./cmd/etl ems "<구급출동_2021.csv 경로>"
func runEMS(ctx context.Context, pool *pgxpool.Pool, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if err != nil {
		return err
	}
	col := map[string]int{}
	for i, h := range header {
		col[strings.TrimPrefix(strings.TrimSpace(h), "\ufeff")] = i
	}
	for _, need := range []string{"DCLR_YR", "ACDNT_OCRN_LOT", "ACDNT_OCRN_LAT"} {
		if _, ok := col[need]; !ok {
			return fmt.Errorf("%s 컬럼이 없음 (구급출동 현황 CSV 가 맞는지 확인)", need)
		}
	}

	known := map[string]bool{}
	cells, err := queryStrings(ctx, pool, `SELECT h3_index FROM h3_cell`)
	if err != nil {
		return err
	}
	for _, c := range cells {
		known[c] = true
	}

	type key struct {
		cell string
		year int
	}
	counts := map[key]int{}
	years := map[int]bool{}
	total, noCoord, outside := 0, 0, 0
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		total++
		field := func(name string) string {
			if i := col[name]; i < len(rec) {
				return strings.TrimSpace(rec[i])
			}
			return ""
		}
		lng, err1 := strconv.ParseFloat(field("ACDNT_OCRN_LOT"), 64)
		lat, err2 := strconv.ParseFloat(field("ACDNT_OCRN_LAT"), 64)
		year, err3 := strconv.Atoi(field("DCLR_YR"))
		if err1 != nil || err2 != nil || err3 != nil || !geo.InJeju(lat, lng) {
			noCoord++
			continue
		}
		cell, err := h3.LatLngToCell(h3.NewLatLng(lat, lng), H3Res)
		if err != nil {
			return err
		}
		if !known[cell.String()] {
			outside++
			continue
		}
		counts[key{cell.String(), year}]++
		years[year] = true
	}

	batch := &pgx.Batch{}
	ys := make([]int, 0, len(years))
	for y := range years {
		ys = append(ys, y)
	}
	slices.Sort(ys)
	batch.Queue(`DELETE FROM cell_ems_count WHERE year = ANY($1)`, ys)
	for k, n := range counts {
		batch.Queue(`INSERT INTO cell_ems_count (h3_index, year, count) VALUES ($1, $2, $3)`, k.cell, k.year, n)
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("cell_ems_count 적재: %w", err)
	}
	log.Printf("ems: %d행 중 좌표 없음/제주 밖 %d, 격자 밖 %d → 연도 %v, 출동 있는 셀 %d개",
		total, noCoord, outside, ys, len(counts))
	return runDummyRisk(ctx, pool)
}
