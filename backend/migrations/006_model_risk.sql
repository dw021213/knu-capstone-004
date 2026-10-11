-- 교통사고 ML 모델(backend_catboost_13_v3)이 미리 계산한 날짜·셀별 점수 (2011-01-01 ~ 2021-12-31, 14,669,718행).
-- risk_score 는 사고 확률이 아니라 상대 순위용 점수, risk_percentile 은 그날 3,651셀 중 순위(0~100).
-- 실시간 위험도(risk_score 테이블)와 섞지 않는다.
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/006_model_risk.sql
CREATE TABLE IF NOT EXISTS model_risk_daily (
  date            DATE NOT NULL,
  h3_index        VARCHAR(15) NOT NULL,     -- 대량 적재 속도 때문에 FK 없음 (적재 시 h3_cell 과 대조 검증)
  risk_score      REAL NOT NULL,
  risk_percentile REAL NOT NULL
);
-- 기본키 (date, h3_index) 는 적재 후 생성한다(etl model-risk). 날짜별 조회가 주 용도.

-- 적재한 모델 버전 정보 (한 번에 한 버전만 둔다)
CREATE TABLE IF NOT EXISTS model_risk_meta (
  export_version TEXT PRIMARY KEY,          -- backend_catboost_13_v3
  model_version  TEXT NOT NULL,
  date_start     DATE NOT NULL,
  date_end       DATE NOT NULL,
  rows           BIGINT NOT NULL,
  cells_per_day  INT NOT NULL,
  scores_sha256  TEXT NOT NULL,
  metadata       JSONB NOT NULL,            -- 원본 metadata.json 전체 (제한사항·필드 정의 포함)
  loaded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
