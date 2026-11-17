package api

import (
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// v4For 는 at 날짜(KST)에 쓸 교통·넘어짐 보정 확률 v4 예측 날짜와 응답용 요약을 만든다.
// 그날 결과가 없으면 그 전 가장 최근 결과를 쓰고 stale=true 로 표시한다. 하나도 없으면 date 는 nil(p_* 가 모두 null).
func (h *Handler) v4For(c *gin.Context, at time.Time) (date *string, info gin.H, err error) {
	want := at.Format("2006-01-02")
	info = gin.H{"requested_date": want}
	var (
		pred, model, quality, runID string
		generated                   time.Time
	)
	err = h.DB.QueryRow(c, `
		SELECT to_char(prediction_date, 'YYYY-MM-DD'), model_id, data_quality, run_id, generated_at
		FROM risk_v4_run WHERE prediction_date <= $1::date ORDER BY prediction_date DESC LIMIT 1`, want).
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

// v4SQL 은 셀 c, 기상 판별 JSON(지점번호 → {rate_ratio, …}) wx, 예측 날짜 d 로 v4 확률(기상 반영 전·후)을 계산하는 LATERAL 조각.
// 기상 반영: q′ = 1 − (1 − q)^배율 (그날 출동 건수가 배율만큼 늘 때 '1건 이상' 확률). 교통 모델 없는 셀은 교통 null, 합산은 넘어짐만.
func v4SQL(cell, stn, wx, d string) string {
	return `LEFT JOIN LATERAL (
  SELECT v.traffic_prob AS t0, v.fall_prob AS f0, v.combined_index AS c0, v.index_scope AS scope,
         v.traffic_quality, v.fall_quality, r.rt, r.rf,
         CASE WHEN r.rt = 1 THEN v.traffic_prob ELSE 1 - power(1 - v.traffic_prob, r.rt) END AS t1,
         CASE WHEN r.rf = 1 THEN v.fall_prob ELSE 1 - power(1 - v.fall_prob, r.rf) END AS f1
  FROM risk_v4_score v
  CROSS JOIN LATERAL (
    SELECT COALESCE((` + wx + `::jsonb -> ` + stn + `::text -> 'rate_ratio' ->> 'traffic')::float8, 1) AS rt,
           COALESCE((` + wx + `::jsonb -> ` + stn + `::text -> 'rate_ratio' ->> 'fall')::float8, 1) AS rf
  ) r
  WHERE v.h3_index = ` + cell + ` AND v.prediction_date = ` + d + `::date
) p4 ON true`
}

// v4Meta 는 /api/risk/meta 의 v4 항목.
func (h *Handler) v4Meta(c *gin.Context) gin.H {
	type run struct {
		Date        string `json:"prediction_date"`
		ModelID     string `json:"model_id"`
		DataQuality string `json:"data_quality"`
	}
	rows, err := h.DB.Query(c, `
		SELECT to_char(prediction_date, 'YYYY-MM-DD'), model_id, data_quality FROM risk_v4_run ORDER BY prediction_date DESC LIMIT 60`)
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
		"label": "교통·넘어짐 보정 확률 (v4)",
		"runs":  runs,
		"fields": map[string]string{
			"p_traffic":       "교통사고 출동이 그날 그 셀에 1건 이상 있을 확률 추정 (0~1, 기상 반영). 교통 모델 없는 셀은 null(위험 0 아님)",
			"p_fall":          "넘어짐·추락 출동 1건 이상 확률 추정 (0~1, 기상 반영)",
			"p_combined":      "p_traffic + p_fall (0~2 종합 위험지수, 확률 아님). 교통 없는 셀은 p_fall 만(부분 지수)",
			"p_*_base":        "기상 반영 전 (모델 전달값 그대로)",
			"p_scope":         "traffic_and_fall | fall_only_partial",
			"p_weather_rr":    "그 셀 지점의 기상 사고 배율 {traffic, fall} (1 = 영향 없음)",
			"p_fall_quality":  "넘어짐 입력 품질 (partial_arrivals = 입도객 일부 결측, 숨기지 말고 표시)",
			"p_traffic_level": "없음 — 등급·색 경계는 아직 정하지 않았다(전달본도 자동 등급을 만들지 않음)",
		},
		"formula": "q교통 = sigmoid(1.0303·logit(t) − 2.9617), q넘어짐 = sigmoid(0.8965·logit(f) − 1.2038), 종합 = q교통 + q넘어짐. 기상: q′ = 1 − (1 − q)^배율",
		"date":    "at 날짜(KST)의 예측을 쓰고, 없으면 그 전 최근 예측 + v4.stale=true",
		"notes": []string{
			"기존 risk_*(교통 도로 백분위)·fall_*(넘어짐 백분위)와 섞지 않는다. 백분위 색 경계를 이 확률에 그대로 쓰지 말 것",
			"종합 위험지수는 확률이 아니다. 0.6 + 0.6 = 1.2 가 정상이며 1 로 자르지 않는다",
			"기상 배율은 7년(2011~2015·2020·2021) 구급출동 × AWS 분석(관측소×월 비교). 호우는 1(근거 없음), 결빙(최근 24시간 최저 ≤0℃ / ≤−2℃)은 교통 ×1.12/×1.35, 넘어짐 ×1.33/×1.58",
			"2026년 실제 정확도는 검증되지 않았다 (보정 학습 2020, 2021 비교 포착률 78%)",
			"넘어짐은 입도객(D-2, 7·28일 평균)·공휴일·계절로 날짜마다 바뀐다. 새 날짜는 Python 예측(run_daily.sh) → etl risk-v4 로 넣는다",
		},
	}
}
