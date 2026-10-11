package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// 교통사고 ML 모델(model_risk_daily)의 날짜별 점수.
// 점수는 2011~2021 역사적 상대 순위다. 사고 확률·실시간 예측으로 표시하지 않는다.
const modelLegend = "선택 날짜의 상대 위험 순위"

type modelRange struct {
	Version string
	Start   time.Time
	End     time.Time
}

func (h *Handler) modelRange(c *gin.Context) (modelRange, error) {
	var m modelRange
	err := h.DB.QueryRow(c, `SELECT export_version, date_start, date_end FROM model_risk_meta LIMIT 1`).
		Scan(&m.Version, &m.Start, &m.End)
	return m, err
}

// modelDate 는 ?date=YYYY-MM-DD 를 검사한다. 파라미터가 없으면 (nil, true).
// 형식 오류는 400, 모델 범위 밖·모델 미적재는 404 로 응답하고 ok=false 를 돌려준다.
// 데이터가 없는 날짜를 0점(안전)으로 채우지 않기 위해 범위를 먼저 확인한다.
func (h *Handler) modelDate(c *gin.Context) (date *time.Time, ok bool) {
	s := c.Query("date")
	if s == "" {
		return nil, true
	}
	d, err := time.Parse(time.DateOnly, s)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date 형식은 YYYY-MM-DD"})
		return nil, false
	}
	m, err := h.modelRange(c)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "모델 점수가 적재되지 않음 (etl model-risk)"})
		return nil, false
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return nil, false
	}
	if d.Before(m.Start) || d.After(m.End) {
		c.JSON(http.StatusNotFound, gin.H{
			"error":     "데이터 없음",
			"date":      s,
			"available": gin.H{"start": m.Start.Format(time.DateOnly), "end": m.End.Format(time.DateOnly)},
			"version":   m.Version,
		})
		return nil, false
	}
	return &d, true
}

const modelMetaSQL = `
SELECT json_build_object(
  'version', export_version,
  'model_version', model_version,
  'date_start', date_start,
  'date_end', date_end,
  'rows', rows,
  'cells_per_day', cells_per_day,
  'loaded_at', loaded_at,
  'legend', $1::text,
  'score_note', 'risk_score 는 사고 확률이 아닌 상대 순위용 점수, risk_percentile 은 그날 전체 셀 중 순위(0~100)',
  'limitations', metadata->'limitations'
)
FROM model_risk_meta LIMIT 1`

// GET /api/model-risk/meta — 모델 버전, 조회 가능 날짜 범위, 범례 문구, 제한사항
func (h *Handler) modelMeta(c *gin.Context) {
	var raw []byte
	err := h.DB.QueryRow(c, modelMetaSQL, modelLegend).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "모델 점수가 적재되지 않음 (etl model-risk)"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", raw)
}

const modelDaySQL = `
SELECT json_build_object(
  'version', (SELECT export_version FROM model_risk_meta LIMIT 1),
  'date', $1::date,
  'legend', $2::text,
  'cells', COALESCE(json_agg(json_build_object(
    'h3', h3_index,
    'score', risk_score,
    'percentile', round(risk_percentile::numeric, 3)
  ) ORDER BY h3_index), '[]'::json)
)
FROM model_risk_daily WHERE date = $1`

// GET /api/model-risk?date=YYYY-MM-DD — 그날 전체 셀 점수(지도 경계 없이 가벼운 목록). 경계는 /api/grid 의 h3 로 연결.
func (h *Handler) modelDay(c *gin.Context) {
	if c.Query("date") == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date=YYYY-MM-DD 필요"})
		return
	}
	d, ok := h.modelDate(c)
	if !ok {
		return
	}
	var raw []byte
	if err := h.DB.QueryRow(c, modelDaySQL, *d, modelLegend).Scan(&raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", raw)
}
