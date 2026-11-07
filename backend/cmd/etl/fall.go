package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// runFall 은 넘어짐·추락 모델 예측 결과(jeju-risk-backend-v1 의 output/fall.json, 하루치)를 fall_run·fall_score 에 넣는다.
// 같은 예측 날짜가 이미 있으면 교체한다. 3,651행·고유 h3·격자 일치·display_eligible↔백분위 일치를 검사하고 어긋나면 롤백.
// 교통사고 위험도(hazard_score)와 합치지 않는다(전달본 안내: 두 모델 점수·백분위를 평균내지 말 것).
//
//	go run ./cmd/etl fall "<jeju-risk-backend-v1>/output/fall.json"
func runFall(ctx context.Context, pool *pgxpool.Pool, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var f struct {
		Metadata json.RawMessage `json:"metadata"`
		Rows     []struct {
			H3              string   `json:"h3"`
			RiskScore       *float64 `json:"risk_score"`
			RiskPercentile  *float64 `json:"risk_percentile"`
			Rank            *float64 `json:"rank"`
			DisplayEligible bool     `json:"display_eligible"`
			Quality         string   `json:"quality"`
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
	}
	if err := json.Unmarshal(f.Metadata, &meta); err != nil {
		return fmt.Errorf("metadata: %w", err)
	}
	if meta.SchemaVersion != 1 || meta.ModelType != "fall" {
		return fmt.Errorf("schema_version %d, model_type %q — fall.json(schema 1) 이 아님", meta.SchemaVersion, meta.ModelType)
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

	batch := &pgx.Batch{}
	batch.Queue(`DELETE FROM fall_run WHERE prediction_date = $1`, date) // fall_score 는 CASCADE
	batch.Queue(`INSERT INTO fall_run (prediction_date, model_id, run_id, generated_at, data_quality, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)`, date, meta.ModelID, meta.RunID, generated, meta.DataQuality, f.Metadata)
	seen := map[string]bool{}
	eligible := 0
	for i, r := range f.Rows {
		if !known[r.H3] || seen[r.H3] {
			return fmt.Errorf("%d번째 행: 격자에 없거나 중복된 h3 %q", i+1, r.H3)
		}
		seen[r.H3] = true
		if r.RiskScore == nil {
			return fmt.Errorf("%s: risk_score 없음", r.H3)
		}
		if r.DisplayEligible != (r.RiskPercentile != nil) {
			return fmt.Errorf("%s: display_eligible=%v 인데 백분위 %v", r.H3, r.DisplayEligible, r.RiskPercentile)
		}
		if p := r.RiskPercentile; p != nil && (*p < 0 || *p > 100) {
			return fmt.Errorf("%s: 백분위 %v 가 0~100 밖", r.H3, *p)
		}
		var rank any
		if r.Rank != nil {
			rank = int(*r.Rank)
		}
		if r.DisplayEligible {
			eligible++
		}
		batch.Queue(`INSERT INTO fall_score (prediction_date, h3_index, score, percentile, rank, display_eligible, quality)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`, date, r.H3, *r.RiskScore, r.RiskPercentile, rank, r.DisplayEligible, r.Quality)
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("fall_score 적재: %w", err)
	}
	log.Printf("fall: %s %s %d셀 (표시 가능 %d), 자료 품질 %s", meta.PredictionDate, meta.ModelID, len(f.Rows), eligible, meta.DataQuality)
	if meta.DataQuality != "complete" {
		log.Printf("fall: ⚠️ data_quality=%s — API 에 그대로 표시된다", meta.DataQuality)
	}
	return nil
}
