-- 종합 위험도: 위험 모델(교통사고·재난·범죄)별 점수 + 고립도(한산함) → 최종 위험도
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/006_hazard_risk.sql

-- (2026-10-12) 기존 날짜별 교통사고 모델(backend_catboost_13_v3, 2011~2021)은 도로 전용 모델로 교체하며 삭제
DROP TABLE IF EXISTS model_risk_daily;
DROP TABLE IF EXISTS model_risk_meta;

-- 위험 모델별 정보 (모델당 한 버전)
CREATE TABLE IF NOT EXISTS hazard_meta (
  hazard        TEXT PRIMARY KEY,           -- traffic | disaster | crime
  label         TEXT NOT NULL,              -- 화면 표시명
  dataset_id    TEXT NOT NULL,              -- 예: jeju_h3_r8_road_catboost_20260914_v1
  snapshot_date DATE,                       -- 입력 자료 기준일 (예측 대상 날짜 아님)
  metadata      JSONB NOT NULL,             -- 원본 metadata.json 전체 (제한사항 포함)
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 위험 모델별 셀 점수
CREATE TABLE IF NOT EXISTS hazard_score (
  h3_index   VARCHAR(15) REFERENCES h3_cell ON DELETE CASCADE,
  hazard     TEXT NOT NULL REFERENCES hazard_meta ON DELETE CASCADE,
  score      REAL NOT NULL,                 -- 모델 원점수 (확률 아님)
  percentile REAL,                          -- 0~100 상대 순위. 입력자료가 없는 셀은 NULL (예: 도로 없는 셀)
  available  BOOLEAN NOT NULL,              -- 이 셀에 모델 입력자료가 있는지 (교통사고: has_road)
  PRIMARY KEY (h3_index, hazard)
);

-- 셀별 유동인구 (고립도 계산용)
CREATE TABLE IF NOT EXISTS cell_population (
  h3_index   VARCHAR(15) PRIMARY KEY REFERENCES h3_cell ON DELETE CASCADE,
  population REAL NOT NULL,                 -- 250m 격자 유동인구 합 (중복 카운트 포함 추정치)
  n_250m     INT NOT NULL,                  -- 합친 250m 격자 수
  source     TEXT NOT NULL
);

-- 최종 위험도 = 0.8 × 위해도(가용 위험 모델 백분위 평균) + 0.2 × 고립도  (internal/risk)
CREATE TABLE IF NOT EXISTS risk_combined (
  h3_index     VARCHAR(15) PRIMARY KEY REFERENCES h3_cell ON DELETE CASCADE,
  hazard       REAL,                        -- 0~1, 가용 위험 모델 백분위/100 의 평균. 모델 자료가 하나도 없으면 NULL
  isolation    REAL NOT NULL,               -- 0~1, 1 − 유동인구 백분위 순위 (가장 한산 = 1)
  score        REAL,                        -- 0~1 최종 점수. hazard 가 NULL 이면 NULL ("자료 없음")
  percentile   REAL,                        -- 0~100 최종 점수의 셀 간 상대 순위
  level        SMALLINT,                    -- 1~5 (백분위 10/30/70/90 경계)
  hazards_used TEXT[] NOT NULL,             -- 이 셀 위해도에 들어간 모델
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- v_cell_risk 에 최종 위험도·구성요소 추가
DROP VIEW IF EXISTS v_cell_risk;
CREATE VIEW v_cell_risk AS
SELECT c.h3_index,
       rc.level                                 AS risk_level,
       round(rc.percentile::numeric, 1)         AS risk_percentile,
       round(rc.score::numeric, 3)              AS risk_score,
       round(rc.hazard::numeric, 3)             AS hazard,
       round(rc.isolation::numeric, 3)          AS isolation,
       round(ht.percentile::numeric, 1)         AS traffic_percentile,
       ht.available                             AS has_road,
       round(p.population::numeric)             AS population,
       round(s.nearest_drive_min::numeric, 1)   AS fire_drive_min,
       round(s.nearest_dist_m::numeric)         AS fire_dist_m,
       e.count                                  AS ems_count,
       c.center,
       c.geom
FROM h3_cell c
LEFT JOIN risk_combined rc ON rc.h3_index = c.h3_index
LEFT JOIN hazard_score ht ON ht.h3_index = c.h3_index AND ht.hazard = 'traffic'
LEFT JOIN cell_population p ON p.h3_index = c.h3_index
LEFT JOIN (SELECT h3_index, sum(count)::int AS count FROM cell_ems_count GROUP BY h3_index) e ON e.h3_index = c.h3_index
LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = 'fire_station';
