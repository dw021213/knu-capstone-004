-- 시간대별 유동인구로 고립도 계산 (2015-01 제주도민, 조건 8종 × 0~23시)
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/008_hourly_population.sql
DROP VIEW IF EXISTS v_cell_risk;
DROP TABLE IF EXISTS cell_population;     -- 월 단위(2015-12 성연령별) → 시간대별로 교체
DROP TABLE IF EXISTS risk_combined;       -- 조건·시간대 차원 추가로 재생성

-- 조건: all(전체) weekday(평일) holiday(휴일) preholiday(휴일전날) clear(맑음) cloudy(흐림) rain(비) snow(눈)
CREATE TABLE IF NOT EXISTS population_source (
  condition TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  file      TEXT NOT NULL,
  std_ym    TEXT NOT NULL                   -- 기준년월 (예: 2015-01)
);

CREATE TABLE IF NOT EXISTS cell_population_hourly (
  h3_index   VARCHAR(15) REFERENCES h3_cell ON DELETE CASCADE,
  condition  TEXT NOT NULL REFERENCES population_source ON DELETE CASCADE,
  hour       SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  population REAL NOT NULL,                 -- 그 시간대 250m 격자 유동인구 합 (중복 카운트 포함 추정치)
  PRIMARY KEY (h3_index, condition, hour)
);

-- 최종 위험도 = 0.8 × 위해도 + 0.2 × 고립도(조건·시간대별)  (internal/risk)
CREATE TABLE IF NOT EXISTS risk_combined (
  h3_index          VARCHAR(15) REFERENCES h3_cell ON DELETE CASCADE,
  condition         TEXT NOT NULL,
  hour              SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  hazard            REAL,                   -- 0~1, 가용 위험 모델 백분위/100 평균 (조건·시간 무관). 없으면 NULL
  isolation         REAL NOT NULL,          -- 0~1, 1 − 그 조건·시간대 유동인구 백분위
  score             REAL,                   -- 0~1 최종 점수, hazard NULL 이면 NULL
  percentile        REAL,                   -- 0~100 최종 점수의 셀 간 순위
  level             SMALLINT,               -- 1~5
  hazard_percentile REAL,                   -- 유동인구 끔: 위해도만의 순위
  hazard_level      SMALLINT,
  hazards_used      TEXT[] NOT NULL,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (h3_index, condition, hour)
);
CREATE INDEX IF NOT EXISTS risk_combined_slot_idx ON risk_combined (condition, hour);

-- DBeaver 조회용: 전체(all) 조건, 현재 한국 시각 시간대 기준
CREATE VIEW v_cell_risk AS
SELECT c.h3_index,
       rc.condition,
       rc.hour,
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
       c.center,
       c.geom
FROM h3_cell c
LEFT JOIN risk_combined rc ON rc.h3_index = c.h3_index
  AND rc.condition = 'all' AND rc.hour = EXTRACT(hour FROM now() AT TIME ZONE 'Asia/Seoul')
LEFT JOIN hazard_score ht ON ht.h3_index = c.h3_index AND ht.hazard = 'traffic'
LEFT JOIN cell_population_hourly p ON p.h3_index = c.h3_index AND p.condition = rc.condition AND p.hour = rc.hour
LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = 'fire_station';
