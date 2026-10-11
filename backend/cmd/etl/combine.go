package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jejurisk/internal/risk"
)

// runCombine 은 위험 모델 점수(hazard_score)와 유동인구(cell_population)로 최종 위험도(risk_combined)를 계산한다.
// 규칙은 internal/risk 참고. road-risk·population 적재 뒤 자동 실행되고, 단독 실행도 된다.
//
//	go run ./cmd/etl combine
func runCombine(ctx context.Context, pool *pgxpool.Pool) error {
	type cell struct {
		h3   string
		pop  float64
		pcts map[string]float64
	}
	r, err := pool.Query(ctx, `SELECT c.h3_index, COALESCE(p.population, 0) FROM h3_cell c
		LEFT JOIN cell_population p ON p.h3_index = c.h3_index ORDER BY c.h3_index`)
	if err != nil {
		return err
	}
	cells, err := pgx.CollectRows(r, func(row pgx.CollectableRow) (cell, error) {
		c := cell{pcts: map[string]float64{}}
		return c, row.Scan(&c.h3, &c.pop)
	})
	if err != nil {
		return err
	}
	byH3 := make(map[string]*cell, len(cells))
	pops := make([]float64, len(cells))
	for i := range cells {
		byH3[cells[i].h3] = &cells[i]
		pops[i] = cells[i].pop
	}

	r, err = pool.Query(ctx, `SELECT h3_index, hazard, percentile FROM hazard_score WHERE available AND percentile IS NOT NULL`)
	if err != nil {
		return err
	}
	nHazard := map[string]int{}
	for r.Next() {
		var h3, hz string
		var p float64
		if err := r.Scan(&h3, &hz, &p); err != nil {
			return err
		}
		if c := byH3[h3]; c != nil {
			c.pcts[hz] = p
			nHazard[hz]++
		}
	}
	if err := r.Err(); err != nil {
		return err
	}

	// 고립도는 전체 셀 기준 순위 (인구 자료 없는 셀 = 0명 = 가장 한산)
	iso := risk.Isolation(pops)

	type result struct {
		hazard, score *float64
		used          []string
	}
	results := make([]result, len(cells))
	var scored []int
	var scores, hazards []float64
	for i, c := range cells {
		h, used, ok := risk.Hazard(c.pcts)
		results[i].used = used
		if !ok {
			continue // 위험 모델 자료 없음 → 최종 위험도 없음 ("자료 없음")
		}
		s := risk.Combine(h, iso[i])
		results[i].hazard, results[i].score = &h, &s
		scored = append(scored, i)
		scores = append(scores, s)
		hazards = append(hazards, h)
	}
	ranks := risk.PercentRanks(scores)
	hRanks := risk.PercentRanks(hazards) // 유동인구(고립도)를 끈 경우의 순위

	batch := &pgx.Batch{}
	batch.Queue(`TRUNCATE risk_combined`)
	pctOf := make(map[int]float64, len(scored))
	hPctOf := make(map[int]float64, len(scored))
	for k, i := range scored {
		pctOf[i] = ranks[k] * 100
		hPctOf[i] = hRanks[k] * 100
	}
	levels := map[int]int{}
	for i, c := range cells {
		res := results[i]
		var pct, level, hPct, hLevel any
		if p, ok := pctOf[i]; ok {
			l := risk.Level(p)
			pct, level = p, l
			levels[l]++
			hPct, hLevel = hPctOf[i], risk.Level(hPctOf[i])
		}
		used := res.used
		if used == nil {
			used = []string{}
		}
		batch.Queue(`INSERT INTO risk_combined
			(h3_index, hazard, isolation, score, percentile, level, hazard_percentile, hazard_level, hazards_used)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			c.h3, res.hazard, iso[i], res.score, pct, level, hPct, hLevel, used)
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("risk_combined 적재: %w", err)
	}
	log.Printf("combine: %s (위해도 %.1f + 고립도 %.1f) 위험 모델 %v → 최종 위험도 %d셀, 자료 없음 %d셀, 등급 분포 %v",
		risk.Version, risk.WeightHazard, risk.WeightIsolation, nHazard, len(scored), len(cells)-len(scored), levels)
	return nil
}
