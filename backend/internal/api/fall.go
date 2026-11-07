package api

import (
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// fallFor 는 at 날짜(KST)에 쓸 넘어짐·추락 예측 날짜와 응답용 요약을 만든다.
// 그날 결과가 없으면 그 전 가장 최근 결과를 쓰고 stale=true 로 표시한다(다른 날 결과를 그날 것처럼 보이지 않게).
// 하나도 없으면 date 는 nil(SQL 에서 fall_* 가 모두 null).
func (h *Handler) fallFor(c *gin.Context, at time.Time) (date *string, info gin.H, err error) {
	want := at.Format("2006-01-02")
	info = gin.H{"requested_date": want}
	var (
		pred, model, quality, runID string
		generated                   time.Time
	)
	err = h.DB.QueryRow(c, `
		SELECT to_char(prediction_date, 'YYYY-MM-DD'), model_id, data_quality, run_id, generated_at
		FROM fall_run WHERE prediction_date <= $1::date ORDER BY prediction_date DESC LIMIT 1`, want).
		Scan(&pred, &model, &quality, &runID, &generated)
	if errors.Is(err, pgx.ErrNoRows) {
		info["status"] = "none"
		return nil, info, nil
	}
	if err != nil {
		return nil, nil, err
	}
	info["status"] = "ok"
	info["prediction_date"] = pred
	info["stale"] = pred != want
	info["model_id"] = model
	info["data_quality"] = quality
	info["run_id"] = runID
	info["generated_at"] = generated
	return &pred, info, nil
}

// fallMeta 는 /api/risk/meta 의 fall 항목.
func (h *Handler) fallMeta(c *gin.Context) gin.H {
	type run struct {
		Date        string `json:"prediction_date"`
		ModelID     string `json:"model_id"`
		DataQuality string `json:"data_quality"`
	}
	rows, err := h.DB.Query(c, `
		SELECT to_char(prediction_date, 'YYYY-MM-DD'), model_id, data_quality FROM fall_run ORDER BY prediction_date DESC LIMIT 60`)
	if err != nil {
		return gin.H{"error": err.Error()}
	}
	runs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (run, error) {
		var x run
		return x, r.Scan(&x.Date, &x.ModelID, &x.DataQuality)
	})
	if err != nil {
		return gin.H{"error": err.Error()}
	}
	return gin.H{
		"label":  "넘어짐·추락 상대 위험도",
		"runs":   runs,
		"fields": "fall_score = 모델 원점수(확률 아님), fall_percentile = 전체 3,651셀 기준 순위(0~100), fall_level = 같은 10/30/70/90 경계의 1~5",
		"date":   "at 날짜(KST)의 예측을 쓰고, 없으면 그 전 최근 예측 + fall.stale=true",
		"notes": []string{
			"교통사고 위험도(risk_*)와 별개다. 두 백분위를 평균내지 말 것 (교통은 도로 2,249셀, 넘어짐은 전체 3,651셀 기준)",
			"입도객 수(D-2, 7·28일 평균)·공휴일·지형·등산로 등으로 날짜마다 바뀐다. 과거 사고 이력은 입력하지 않는다",
			"data_quality=partial_arrivals 는 입도객 원자료 일부가 결측이라는 뜻이다. 숨기지 말고 표시한다",
			"2026년 실제 정확도는 검증되지 않았다 (2021 상위 20% 포착률 74%, 2021 로 모델을 골라 독립 시험 아님)",
		},
	}
}
