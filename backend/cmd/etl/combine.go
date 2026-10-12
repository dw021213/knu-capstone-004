package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jejurisk/internal/risk"
)

// runCombine 은 위험 모델 점수(hazard_score)와 시간대별 유동인구(cell_population_hourly)로
// 조건 × 시간대마다 최종 위험도(risk_combined)를 계산한다. 규칙은 internal/risk 참고.
// road-risk·population 적재 뒤 자동 실행되고, 단독 실행도 된다.
//
//	go run ./cmd/etl combine
func runCombine(ctx context.Context, pool *pgxpool.Pool) error {
	cells, err := queryStrings(ctx, pool, `SELECT h3_index FROM h3_cell ORDER BY h3_index`)
	if err != nil {
		return err
	}
	idx := make(map[string]int, len(cells))
	for i, h := range cells {
		idx[h] = i
	}

	// 위해도 (조건·시간 무관)
	pcts := make([]map[string]float64, len(cells))
	for i := range pcts {
		pcts[i] = map[string]float64{}
	}
	r, err := pool.Query(ctx, `SELECT h3_index, hazard, percentile FROM hazard_score WHERE available AND percentile IS NOT NULL`)
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
		if i, ok := idx[h3]; ok {
			pcts[i][hz] = p
			nHazard[hz]++
		}
	}
	if err := r.Err(); err != nil {
		return err
	}
	hazard := make([]*float64, len(cells))
	used := make([][]string, len(cells))
	var scored []int
	var hazardVals []float64
	for i := range cells {
		h, u, ok := risk.Hazard(pcts[i])
		used[i] = u
		if used[i] == nil {
			used[i] = []string{}
		}
		if ok {
			hazard[i] = &h
			scored = append(scored, i)
			hazardVals = append(hazardVals, h)
		}
	}
	// 유동인구를 끈 경우의 순위·등급 (모든 조건·시간대에 같은 값)
	hPct := make(map[int]float64, len(scored))
	for k, rk := range risk.PercentRanks(hazardVals) {
		hPct[scored[k]] = rk * 100
	}

	// 시간대별 유동인구: (조건, 시간) → 셀 순서대로 인구 (없으면 0명)
	type slot struct {
		cond string
		hour int
	}
	pops := map[slot][]float64{}
	for _, c := range risk.Conditions {
		for h := 0; h < 24; h++ {
			pops[slot{c.Key, h}] = make([]float64, len(cells))
		}
	}
	r, err = pool.Query(ctx, `SELECT h3_index, condition, hour, population FROM cell_population_hourly`)
	if err != nil {
		return err
	}
	nPop := 0
	for r.Next() {
		var h3, cond string
		var hour int16
		var p float64
		if err := r.Scan(&h3, &cond, &hour, &p); err != nil {
			return err
		}
		if v, ok := pops[slot{cond, int(hour)}]; ok {
			if i, ok := idx[h3]; ok {
				v[i] = p
				nPop++
			}
		}
	}
	if err := r.Err(); err != nil {
		return err
	}
	if nPop == 0 {
		log.Printf("combine: 시간대별 유동인구가 없어 고립도를 모두 같은 값으로 계산 (먼저 `etl population`)")
	}

	// 공통 기준(C 방식): 모든 조건·시간대·셀의 유동인구를 한 줄로 세워 고립도를 매기고,
	// 모든 조건·시간대의 최종 점수를 한 줄로 세워 순위·등급을 매긴다.
	// → 새벽처럼 전체가 한산한 시간대는 고립도·위험도가 함께 올라가 시간대 간 비교가 된다.
	var slots []slot
	for _, c := range risk.Conditions {
		for h := 0; h < 24; h++ {
			slots = append(slots, slot{c.Key, h})
		}
	}
	allPop := make([]float64, 0, len(slots)*len(cells))
	for _, sl := range slots {
		allPop = append(allPop, pops[sl]...)
	}
	iso := risk.Isolation(allPop) // iso[si*len(cells)+i]

	allScore := make([]float64, 0, len(slots)*len(scored))
	for si := range slots {
		for _, i := range scored {
			allScore = append(allScore, risk.Combine(*hazard[i], iso[si*len(cells)+i]))
		}
	}
	pct := risk.PercentRanks(allScore) // pct[si*len(scored)+k]
	pos := make(map[int]int, len(scored))
	for k, i := range scored {
		pos[i] = k
	}

	now := time.Now()
	var rows [][]any
	levels := map[string]map[int]int{"all@3": {}, "all@12": {}}
	for si, sl := range slots {
		for i, h3 := range cells {
			var hz, score, p, lvl, hp, hl any
			isoV := iso[si*len(cells)+i]
			if hazard[i] != nil {
				k := pos[i]
				pv := pct[si*len(scored)+k] * 100
				l := risk.Level(pv)
				hz = float32(*hazard[i])
				score, p, lvl = float32(allScore[si*len(scored)+k]), float32(pv), int16(l)
				hp, hl = float32(hPct[i]), int16(risk.Level(hPct[i]))
				if m, ok := levels[fmt.Sprintf("%s@%d", sl.cond, sl.hour)]; ok {
					m[l]++
				}
			}
			rows = append(rows, []any{h3, sl.cond, int16(sl.hour), hz, float32(isoV), score, p, lvl, hp, hl, used[i], now})
		}
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `TRUNCATE risk_combined`); err != nil {
		return err
	}
	n, err := tx.CopyFrom(ctx, pgx.Identifier{"risk_combined"},
		[]string{"h3_index", "condition", "hour", "hazard", "isolation", "score", "percentile", "level",
			"hazard_percentile", "hazard_level", "hazards_used", "computed_at"},
		pgx.CopyFromRows(rows))
	if err != nil {
		return fmt.Errorf("risk_combined 적재: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if _, err := pool.Exec(ctx, `ANALYZE risk_combined`); err != nil {
		return err
	}
	log.Printf("combine: %s (위해도 %.1f + 고립도 %.1f, 공통 기준) 위험 모델 %v → %d행 (조건 %d × 24시간 × 셀 %d), 위험도 있는 셀 %d, 등급 분포 %v",
		risk.Version, risk.WeightHazard, risk.WeightIsolation, nHazard, n, len(risk.Conditions), len(cells), len(scored), levels)
	return nil
}
