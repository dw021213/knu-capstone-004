package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jejurisk/migrations"
)

// runRiskV4 는 교통·넘어짐 보정 확률 v4(jeju-risk-backend-v4 의 output/risks.json, 하루치)를 risk_v4_run·risk_v4_score 에 넣는다.
// 같은 예측 날짜가 이미 있으면 교체한다. 3,651행·고유 h3·격자 일치·확률 범위·합산식(combined = traffic + fall)을 검사하고 어긋나면 롤백.
//
//	go run ./cmd/etl risk-v4 "<jeju-risk-backend-v4>/output/risks.json"
func runRiskV4(ctx context.Context, pool *pgxpool.Pool, path string) error {
	if _, err := pool.Exec(ctx, migrations.RiskV4); err != nil {
		return fmt.Errorf("015 스키마: %w", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var f struct {
		Metadata json.RawMessage `json:"metadata"`
		Rows     []struct {
			H3               string   `json:"h3"`
			Traffic          *float64 `json:"traffic_probability"`
			Fall             *float64 `json:"fall_probability"`
			Combined         *float64 `json:"combined_risk_index"`
			TrafficAvailable bool     `json:"traffic_available"`
			Scope            string   `json:"index_scope"`
			TrafficQuality   *string  `json:"traffic_quality"`
			FallQuality      string   `json:"fall_quality"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	var meta struct {
		SchemaVersion  int    `json:"schema_version"`
		ModelType      string `json:"model_type"`
		ModelID        string `json:"model_id"`
		RunID          string `json:"run_id"`
		GeneratedAt    string `json:"generated_at"`
		PredictionDate string `json:"prediction_date"`
		H3Resolution   int    `json:"h3_resolution"`
		CellCount      int    `json:"cell_count"`
		DataQuality    string `json:"data_quality"`
		Combined       *bool  `json:"combined_is_probability"`
	}
	if err := json.Unmarshal(f.Metadata, &meta); err != nil {
		return fmt.Errorf("metadata: %w", err)
	}
	if meta.SchemaVersion != 4 || meta.ModelType != "additive_risks" {
		return fmt.Errorf("schema_version %d, model_type %q — risks.json(schema 4, additive_risks) 이 아님", meta.SchemaVersion, meta.ModelType)
	}
	if meta.Combined == nil || *meta.Combined {
		return fmt.Errorf("combined_is_probability 가 false 가 아님 — 합산 지수 정의가 바뀌었으면 연동을 다시 볼 것")
	}
	if meta.H3Resolution != H3Res {
		return fmt.Errorf("모델 H3 해상도 %d ≠ 백엔드 %d", meta.H3Resolution, H3Res)
	}
	date, err := time.Parse("2006-01-02", meta.PredictionDate)
	if err != nil {
		return fmt.Errorf("prediction_date %q: %w", meta.PredictionDate, err)
	}
	generated, err := time.Parse(time.RFC3339Nano, meta.GeneratedAt)
	if err != nil {
		return fmt.Errorf("generated_at %q: %w", meta.GeneratedAt, err)
	}
	if meta.ModelID == "" || meta.RunID == "" || meta.DataQuality == "" {
		return fmt.Errorf("metadata 에 model_id·run_id·data_quality 가 비어 있음")
	}

	cells, err := queryStrings(ctx, pool, `SELECT h3_index FROM h3_cell`)
	if err != nil {
		return err
	}
	known := make(map[string]bool, len(cells))
	for _, c := range cells {
		known[c] = true
	}
	if len(f.Rows) != meta.CellCount || len(known) != meta.CellCount {
		return fmt.Errorf("행 %d / 격자 %d / metadata %d 불일치", len(f.Rows), len(known), meta.CellCount)
	}

	prob := func(v float64) bool { return !math.IsNaN(v) && v >= 0 && v <= 1 }
	batch := &pgx.Batch{}
	batch.Queue(`DELETE FROM risk_v4_run WHERE prediction_date = $1`, date) // risk_v4_score 는 CASCADE
	batch.Queue(`INSERT INTO risk_v4_run (prediction_date, model_id, run_id, generated_at, data_quality, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)`, date, meta.ModelID, meta.RunID, generated, meta.DataQuality, f.Metadata)
	seen := map[string]bool{}
	withTraffic := 0
	for i, r := range f.Rows {
		if !known[r.H3] || seen[r.H3] {
			return fmt.Errorf("%d번째 행: 격자에 없거나 중복된 h3 %q", i+1, r.H3)
		}
		seen[r.H3] = true
		if r.Fall == nil || !prob(*r.Fall) || r.Combined == nil {
			return fmt.Errorf("%s: fall_probability/combined_risk_index 가 없거나 0~1 밖", r.H3)
		}
		want := *r.Fall
		switch {
		case r.TrafficAvailable && r.Scope == "traffic_and_fall" && r.Traffic != nil && prob(*r.Traffic):
			want += *r.Traffic
			withTraffic++
		case !r.TrafficAvailable && r.Scope == "fall_only_partial" && r.Traffic == nil:
		default:
			return fmt.Errorf("%s: traffic_available=%v, index_scope=%q, traffic_probability=%v 가 서로 맞지 않음", r.H3, r.TrafficAvailable, r.Scope, r.Traffic)
		}
		if math.Abs(*r.Combined-want) > 1e-9 {
			return fmt.Errorf("%s: combined_risk_index %v ≠ 교통+넘어짐 %v", r.H3, *r.Combined, want)
		}
		batch.Queue(`INSERT INTO risk_v4_score (prediction_date, h3_index, traffic_prob, fall_prob, combined_index, index_scope, traffic_quality, fall_quality)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, date, r.H3, r.Traffic, *r.Fall, *r.Combined, r.Scope, r.TrafficQuality, r.FallQuality)
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("risk_v4_score 적재: %w", err)
	}
	log.Printf("risk-v4: %s %s %d셀 (교통 포함 %d, 넘어짐만 %d), 자료 품질 %s",
		meta.PredictionDate, meta.ModelID, len(f.Rows), withTraffic, len(f.Rows)-withTraffic, meta.DataQuality)
	if meta.DataQuality != "complete" {
		log.Printf("risk-v4: ⚠️ data_quality=%s — API 에 그대로 표시된다", meta.DataQuality)
	}
	return nil
}
