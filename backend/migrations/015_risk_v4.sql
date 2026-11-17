-- 교통·넘어짐 보정 확률 v4 (jeju-risk-backend-v4 의 output/risks.json). 넘어짐이 입도객·날짜로 바뀌므로 날짜별로 저장한다.
-- 기존 지도(risk_* = 교통 백분위, fall_* = 넘어짐 백분위)와 섞지 않는다. API 는 p_* 필드로 따로 내려준다.
-- 서버가 기동할 때 실행한다(IF NOT EXISTS).

-- 예측 실행 1회 = 예측 날짜 1개 (같은 날짜를 다시 넣으면 교체)
CREATE TABLE IF NOT EXISTS risk_v4_run (
  prediction_date DATE PRIMARY KEY,
  model_id        TEXT NOT NULL,          -- 예: traffic_legacy_fall_refit_additive_20261117_v4
  run_id          TEXT NOT NULL,
  generated_at    TIMESTAMPTZ NOT NULL,   -- Python 예측 시각
  data_quality    TEXT NOT NULL,          -- complete | partial_arrivals … 숨기지 않는다
  metadata        JSONB NOT NULL,         -- risks.json metadata 전체 (보정식·입력 해시·입도객 기간)
  loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_v4_score (
  prediction_date  DATE REFERENCES risk_v4_run ON DELETE CASCADE,
  h3_index         VARCHAR(15) REFERENCES h3_cell ON DELETE CASCADE,
  traffic_prob     DOUBLE PRECISION,       -- 그날 그 셀에 교통사고 출동이 1건 이상 있을 보정 확률. 교통 모델 없는 셀은 NULL(위험 0 아님)
  fall_prob        DOUBLE PRECISION NOT NULL, -- 넘어짐·추락 출동 1건 이상 보정 확률
  combined_index   DOUBLE PRECISION NOT NULL, -- traffic_prob + fall_prob (0~2 지수, 확률 아님). 교통 없으면 fall_prob
  index_scope      TEXT NOT NULL,          -- traffic_and_fall | fall_only_partial
  traffic_quality  TEXT,
  fall_quality     TEXT NOT NULL,
  PRIMARY KEY (prediction_date, h3_index)
);
