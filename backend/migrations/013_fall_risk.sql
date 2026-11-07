-- 넘어짐·추락 모델 (jeju-risk-backend-v1 의 output/fall.json). 입도객에 따라 날짜마다 점수가 바뀌어 날짜별로 저장한다.
-- 교통사고(hazard_score)와 섞지 않는다: 지도 기본 색(risk_*)은 그대로 교통사고, 넘어짐은 fall_* 로 따로 내려준다.
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/013_fall_risk.sql

-- 예측 실행 1회 = 예측 날짜 1개 (같은 날짜를 다시 넣으면 교체)
CREATE TABLE IF NOT EXISTS fall_run (
  prediction_date DATE PRIMARY KEY,
  model_id        TEXT NOT NULL,          -- 예: fall_env52_d6_t200_seed42_v1
  run_id          TEXT NOT NULL,
  generated_at    TIMESTAMPTZ NOT NULL,   -- Python 예측 시각
  data_quality    TEXT NOT NULL,          -- complete | partial_arrivals (입도객 일부 결측) …  숨기지 않는다
  metadata        JSONB NOT NULL,         -- fall.json metadata 전체 (입도객 기간·출처 해시 포함)
  loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fall_score (
  prediction_date  DATE REFERENCES fall_run ON DELETE CASCADE,
  h3_index         VARCHAR(15) REFERENCES h3_cell ON DELETE CASCADE,
  score            REAL NOT NULL,         -- 모델 원점수 (확률 아님)
  percentile       REAL,                  -- 0~100, 전체 3,651셀 기준 상대 순위. display_eligible=false 면 NULL
  rank             INT,                   -- 1 = 가장 높음
  display_eligible BOOLEAN NOT NULL,
  quality          TEXT NOT NULL,
  PRIMARY KEY (prediction_date, h3_index)
);
