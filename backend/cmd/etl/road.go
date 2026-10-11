package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// runRoadRisk 는 도로 전용 교통사고 모델(교통사고ML_도로전용_…_백엔드전달) 점수를 hazard_score(hazard='traffic')에 넣고
// 최종 위험도를 다시 계산한다. 인수인계서 확인 항목(해시, 3,651행, 고유 h3, 격자 일치, 도로 셀 수,
// 도로 없는 셀은 백분위 null)을 검사하고 하나라도 어긋나면 롤백한다.
//
//	go run ./cmd/etl road-risk "<교통사고ML_도로전용_…_백엔드전달 폴더>"
func runRoadRisk(ctx context.Context, pool *pgxpool.Pool, dir string) error {
	rawMeta, err := os.ReadFile(filepath.Join(dir, "metadata.json"))
	if err != nil {
		return err
	}
	var meta struct {
		DatasetID        string `json:"dataset_id"`
		RoadSnapshotDate string `json:"road_snapshot_date"`
		Cells            int    `json:"cells"`
		RoadPresentCells int    `json:"road_present_cells"`
		H3Resolution     int    `json:"h3_resolution"`
	}
	if err := json.Unmarshal(rawMeta, &meta); err != nil {
		return fmt.Errorf("metadata.json: %w", err)
	}
	if meta.H3Resolution != H3Res {
		return fmt.Errorf("모델 H3 해상도 %d ≠ 백엔드 %d", meta.H3Resolution, H3Res)
	}

	// 1. artifact_manifest.json 의 SHA-256 과 비교
	var manifest struct {
		Files map[string]struct {
			SHA256 string `json:"sha256"`
		} `json:"files"`
	}
	rawMan, err := os.ReadFile(filepath.Join(dir, "artifact_manifest.json"))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(rawMan, &manifest); err != nil {
		return fmt.Errorf("artifact_manifest.json: %w", err)
	}
	for _, name := range []string{"risk_scores.csv", "metadata.json"} {
		want, ok := manifest.Files[name]
		if !ok {
			return fmt.Errorf("artifact_manifest.json 에 %s 없음", name)
		}
		got, err := sha256File(filepath.Join(dir, name))
		if err != nil {
			return err
		}
		if got != want.SHA256 {
			return fmt.Errorf("%s SHA-256 불일치: manifest %s, 실제 %s", name, want.SHA256, got)
		}
		log.Printf("road-risk: %s SHA-256 일치", name)
	}

	// 2. 점수 CSV 검증
	rows, err := readCSV(filepath.Join(dir, "risk_scores.csv"))
	if err != nil {
		return err
	}
	cells, err := queryStrings(ctx, pool, `SELECT h3_index FROM h3_cell`)
	if err != nil {
		return err
	}
	known := make(map[string]bool, len(cells))
	for _, c := range cells {
		known[c] = true
	}
	if len(rows) != meta.Cells || len(known) != meta.Cells {
		return fmt.Errorf("행 %d / 격자 %d / metadata %d 불일치 (먼저 `go run ./cmd/etl grid`)", len(rows), len(known), meta.Cells)
	}

	batch := &pgx.Batch{}
	batch.Queue(`DELETE FROM hazard_meta WHERE hazard = 'traffic'`) // hazard_score 는 CASCADE 로 함께 삭제
	batch.Queue(`INSERT INTO hazard_meta (hazard, label, dataset_id, snapshot_date, metadata)
		VALUES ('traffic', '도로 특성 기반 상대 교통사고 위험도', $1, $2, $3)`,
		meta.DatasetID, meta.RoadSnapshotDate, rawMeta)
	seen := map[string]bool{}
	withRoad := 0
	for i, r := range rows {
		h := r["h3"]
		if !known[h] || seen[h] {
			return fmt.Errorf("%d행: 격자에 없거나 중복된 h3 %q", i+2, h)
		}
		seen[h] = true
		score, err := strconv.ParseFloat(r["risk_score"], 64)
		if err != nil {
			return fmt.Errorf("%d행 risk_score: %w", i+2, err)
		}
		hasRoad := r["has_road"] == "True"
		var pct any
		if r["risk_percentile"] != "" {
			p, err := strconv.ParseFloat(r["risk_percentile"], 64)
			if err != nil {
				return fmt.Errorf("%d행 risk_percentile: %w", i+2, err)
			}
			pct = p
		}
		if hasRoad != (pct != nil) {
			return fmt.Errorf("%d행 %s: has_road=%v 인데 백분위 %v", i+2, h, hasRoad, pct)
		}
		if hasRoad {
			withRoad++
		}
		batch.Queue(`INSERT INTO hazard_score (h3_index, hazard, score, percentile, available)
			VALUES ($1, 'traffic', $2, $3, $4)`, h, score, pct, hasRoad)
	}
	if withRoad != meta.RoadPresentCells {
		return fmt.Errorf("도로 있는 셀 %d ≠ metadata %d", withRoad, meta.RoadPresentCells)
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("hazard_score 적재: %w", err)
	}
	log.Printf("road-risk: %s (도로자료 %s) %d셀, 도로 있는 셀 %d", meta.DatasetID, meta.RoadSnapshotDate, len(rows), withRoad)
	return runCombine(ctx, pool)
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
