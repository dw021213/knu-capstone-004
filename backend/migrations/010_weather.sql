-- 기상 가산점: AWS 관측값이 우리 기준(특보 기준 참고)을 넘으면 위험도 점수에 가중치를 더한다.
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/010_weather.sql

-- 제주 AWS 지점 (API허브 지점정보)
CREATE TABLE IF NOT EXISTS weather_station (
  stn      INT PRIMARY KEY,
  name     TEXT NOT NULL,
  height_m REAL,
  mountain BOOLEAN NOT NULL,                -- 산지 지점 (지점정보 "(산지)" 표시) → 강풍·대설 산지 기준
  address  TEXT,
  geom     GEOMETRY(Point, 4326) NOT NULL
);

-- 셀 → 가장 가까운 지점
CREATE TABLE IF NOT EXISTS cell_weather_station (
  h3_index VARCHAR(15) PRIMARY KEY REFERENCES h3_cell ON DELETE CASCADE,
  stn      INT NOT NULL REFERENCES weather_station ON DELETE CASCADE,
  dist_m   REAL NOT NULL
);

-- 시간별 관측 (정시, KST). 결측은 NULL
CREATE TABLE IF NOT EXISTS weather_obs (
  stn     INT NOT NULL,
  ts      TIMESTAMPTZ NOT NULL,
  ta      REAL,                             -- 기온 (℃)
  ws      REAL,                             -- 10분 평균 풍속 (m/s)
  rn_1h   REAL,                             -- 1시간 강수량 (mm)
  hm      REAL,                             -- 상대습도 (%)
  snow    REAL,                             -- 적설 (cm), 관측 지점만
  source  TEXT NOT NULL,                    -- apihub | kma_csv | test
  PRIMARY KEY (stn, ts, source)
);
CREATE INDEX IF NOT EXISTS weather_obs_ts_idx ON weather_obs (ts);

-- 등급용 점수 분위수: 기상 가산 후 점수를 기존 분포에 대어 백분위·등급을 매긴다 (etl combine 이 갱신)
CREATE TABLE IF NOT EXISTS risk_score_quantiles (
  kind  TEXT NOT NULL,                      -- combined (유동인구 반영) | hazard (유동인구 끔)
  q     SMALLINT NOT NULL,                  -- 0~100
  score REAL NOT NULL,
  PRIMARY KEY (kind, q)
);

-- 점수 → 백분위 (분위수 사이 선형 보간), 백분위 → 등급 (internal/risk LevelBands 와 같은 경계)
CREATE OR REPLACE FUNCTION risk_pct(p_kind TEXT, p_score DOUBLE PRECISION) RETURNS DOUBLE PRECISION AS $$
  WITH lo AS (SELECT q, score FROM risk_score_quantiles WHERE kind = p_kind AND score <= p_score ORDER BY q DESC LIMIT 1),
       hi AS (SELECT q, score FROM risk_score_quantiles WHERE kind = p_kind AND score > p_score ORDER BY q ASC LIMIT 1)
  SELECT CASE
    WHEN (SELECT q FROM lo) IS NULL THEN 0
    WHEN (SELECT q FROM hi) IS NULL THEN 100
    ELSE (SELECT q FROM lo) + ((SELECT q FROM hi) - (SELECT q FROM lo))
         * (p_score - (SELECT score FROM lo)) / NULLIF((SELECT score FROM hi) - (SELECT score FROM lo), 0)
  END
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION risk_level(p_pct DOUBLE PRECISION) RETURNS SMALLINT AS $$
  SELECT CASE WHEN p_pct IS NULL THEN NULL
              WHEN p_pct >= 90 THEN 5 WHEN p_pct >= 70 THEN 4 WHEN p_pct >= 30 THEN 3 WHEN p_pct >= 10 THEN 2 ELSE 1 END::SMALLINT
$$ LANGUAGE sql IMMUTABLE;
