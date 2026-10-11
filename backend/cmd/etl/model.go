package main

import (
	"bufio"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// 교통사고 ML 전달 폴더(01_백엔드)의 파일 이름
const (
	modelScoresFile   = "daily_risk_scores.jsonl.gz"
	modelCellsFile    = "h3_cells.geojson"
	modelMetadataFile = "metadata.json"
)

type modelMetadata struct {
	ExportVersion string `json:"export_version"`
	ModelVersion  string `json:"model_version"`
	H3Resolution  int    `json:"h3_resolution"`
	Rows          int64  `json:"rows"`
	CellsPerDay   int    `json:"cells_per_day"`
	DateRange     struct {
		Start string `json:"start"`
		End   string `json:"end"`
		Days  int    `json:"days"`
	} `json:"date_range"`
	Files []struct {
		Name   string `json:"name"`
		Bytes  int64  `json:"bytes"`
		SHA256 string `json:"sha256"`
	} `json:"files"`
}

// runModelRisk 는 교통사고 ML 모델이 미리 계산한 날짜·셀별 점수를 model_risk_daily 에 적재한다.
// 인수인계서의 수신 확인 항목(해시, 총 행 수, 날짜별 3,651행, 중복 없음, h3 연결)을 모두 검사하고,
// 하나라도 어긋나면 트랜잭션을 롤백해 기존 데이터를 유지한다.
//
//	go run ./cmd/etl model-risk "<교통사고ML_최종전달_.../01_백엔드 경로>"
func runModelRisk(ctx context.Context, pool *pgxpool.Pool, dir string) error {
	rawMeta, err := os.ReadFile(filepath.Join(dir, modelMetadataFile))
	if err != nil {
		return err
	}
	var meta modelMetadata
	if err := json.Unmarshal(rawMeta, &meta); err != nil {
		return fmt.Errorf("%s: %w", modelMetadataFile, err)
	}
	if meta.H3Resolution != H3Res {
		return fmt.Errorf("모델 H3 해상도 %d ≠ 백엔드 %d", meta.H3Resolution, H3Res)
	}

	// 1. 파일 해시 확인
	scoresSHA := ""
	for _, f := range meta.Files {
		got, err := sha256File(filepath.Join(dir, f.Name))
		if err != nil {
			return err
		}
		if got != f.SHA256 {
			return fmt.Errorf("%s SHA-256 불일치: metadata %s, 실제 %s", f.Name, f.SHA256, got)
		}
		if f.Name == modelScoresFile {
			scoresSHA = got
		}
		log.Printf("model-risk: %s SHA-256 일치", f.Name)
	}
	if scoresSHA == "" {
		return fmt.Errorf("metadata.files 에 %s 가 없음", modelScoresFile)
	}

	// 2. 백엔드 격자가 모델 격자와 같은지
	cells, err := queryStrings(ctx, pool, `SELECT h3_index FROM h3_cell`)
	if err != nil {
		return err
	}
	known := make(map[string]bool, len(cells))
	for _, c := range cells {
		known[c] = true
	}
	if len(known) != meta.CellsPerDay {
		return fmt.Errorf("h3_cell %d개 ≠ 모델 %d개 (먼저 `go run ./cmd/etl grid`)", len(known), meta.CellsPerDay)
	}

	// 3. 스트림으로 읽어 COPY
	f, err := os.Open(filepath.Join(dir, modelScoresFile))
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	src := &modelRowSource{
		sc:      bufio.NewScanner(gz),
		known:   known,
		perDate: map[string]int{},
		started: time.Now(),
	}
	src.sc.Buffer(make([]byte, 1024*1024), 1024*1024)

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		TRUNCATE model_risk_daily;
		ALTER TABLE model_risk_daily DROP CONSTRAINT IF EXISTS model_risk_daily_pkey;
		DELETE FROM model_risk_meta;`); err != nil {
		return err
	}
	n, err := tx.CopyFrom(ctx, pgx.Identifier{"model_risk_daily"},
		[]string{"date", "h3_index", "risk_score", "risk_percentile"}, src)
	if err != nil {
		return fmt.Errorf("COPY (%d행째): %w", src.rows, err)
	}

	// 4. 행 수 검증
	if n != meta.Rows {
		return fmt.Errorf("적재 %d행 ≠ metadata %d행", n, meta.Rows)
	}
	if len(src.perDate) != meta.DateRange.Days {
		return fmt.Errorf("날짜 %d일 ≠ metadata %d일", len(src.perDate), meta.DateRange.Days)
	}
	for d, c := range src.perDate {
		if c != meta.CellsPerDay {
			return fmt.Errorf("%s: %d행 (기대 %d)", d, c, meta.CellsPerDay)
		}
	}
	if src.minDate != meta.DateRange.Start || src.maxDate != meta.DateRange.End {
		return fmt.Errorf("날짜 범위 %s~%s ≠ metadata %s~%s",
			src.minDate, src.maxDate, meta.DateRange.Start, meta.DateRange.End)
	}

	// 5. 기본키 = (date, h3) 중복 검사 겸 날짜 조회 인덱스
	log.Printf("model-risk: 기본키(date, h3_index) 생성 중…")
	if _, err := tx.Exec(ctx, `ALTER TABLE model_risk_daily ADD PRIMARY KEY (date, h3_index)`); err != nil {
		return fmt.Errorf("(date, h3) 중복: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO model_risk_meta
		  (export_version, model_version, date_start, date_end, rows, cells_per_day, scores_sha256, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		meta.ExportVersion, meta.ModelVersion, meta.DateRange.Start, meta.DateRange.End,
		n, meta.CellsPerDay, scoresSHA, rawMeta); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if _, err := pool.Exec(ctx, `ANALYZE model_risk_daily`); err != nil {
		return err
	}
	log.Printf("model-risk: %s 적재 완료 — %d행, %d일 × %d셀, %s~%s (%.0f초)",
		meta.ExportVersion, n, len(src.perDate), meta.CellsPerDay, src.minDate, src.maxDate,
		time.Since(src.started).Seconds())
	return nil
}

// modelRowSource 는 JSONL 한 줄을 COPY 한 행으로 바꾸면서 검증·집계한다.
type modelRowSource struct {
	sc      *bufio.Scanner
	known   map[string]bool
	perDate map[string]int
	minDate string
	maxDate string
	rows    int64
	started time.Time
	vals    []any
	err     error
}

func (s *modelRowSource) Next() bool {
	if !s.sc.Scan() {
		s.err = s.sc.Err()
		return false
	}
	var r struct {
		Date       string   `json:"date"`
		H3         string   `json:"h3"`
		Score      *float64 `json:"risk_score"`
		Percentile *float64 `json:"risk_percentile"`
	}
	s.rows++
	if err := json.Unmarshal(s.sc.Bytes(), &r); err != nil {
		s.err = fmt.Errorf("%d행 JSON: %w", s.rows, err)
		return false
	}
	d, err := time.Parse(time.DateOnly, r.Date)
	if err != nil || r.Score == nil || r.Percentile == nil {
		s.err = fmt.Errorf("%d행 필드 누락/형식 오류: %s", s.rows, s.sc.Text())
		return false
	}
	if !s.known[r.H3] {
		s.err = fmt.Errorf("%d행: 격자에 없는 h3 %q", s.rows, r.H3)
		return false
	}
	s.perDate[r.Date]++
	if s.minDate == "" || r.Date < s.minDate {
		s.minDate = r.Date
	}
	if r.Date > s.maxDate {
		s.maxDate = r.Date
	}
	if s.rows%2_000_000 == 0 {
		log.Printf("model-risk: %d행 (%s) …", s.rows, r.Date)
	}
	s.vals = []any{d, r.H3, float32(*r.Score), float32(*r.Percentile)}
	return true
}

func (s *modelRowSource) Values() ([]any, error) { return s.vals, nil }
func (s *modelRowSource) Err() error             { return s.err }

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
