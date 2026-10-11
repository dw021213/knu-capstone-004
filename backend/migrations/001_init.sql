CREATE EXTENSION IF NOT EXISTS postgis;

-- H3 res8 육각 격자 (정적)
CREATE TABLE h3_cell (
  h3_index VARCHAR(15) PRIMARY KEY,
  geom     GEOMETRY(Polygon, 4326) NOT NULL,
  center   GEOMETRY(Point, 4326)   NOT NULL
);

-- 인근 시설 (type으로 구분: fire_station, cctv, police, cvs ...)
CREATE TABLE facility (
  id       SERIAL PRIMARY KEY,
  type     TEXT NOT NULL,
  name     TEXT NOT NULL,
  address  TEXT,
  geom     GEOMETRY(Point, 4326) NOT NULL,
  h3_index VARCHAR(15),                    -- 격자 밖 시설도 허용하려고 FK 없음
  UNIQUE (type, name)
);

-- 격자별 시설 집계 (모델 입력 피처)
CREATE TABLE cell_facility_stat (
  h3_index       VARCHAR(15) REFERENCES h3_cell ON DELETE CASCADE,
  type           TEXT NOT NULL,
  count_in_cell  INT NOT NULL,
  count_k1       INT NOT NULL,             -- 자기 셀 + 인접 1링
  nearest_dist_m DOUBLE PRECISION,
  PRIMARY KEY (h3_index, type)
);

-- 위험도 (시간에 따라 변하므로 격자와 분리)
CREATE TABLE risk_score (
  h3_index VARCHAR(15) REFERENCES h3_cell ON DELETE CASCADE,
  ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  score    DOUBLE PRECISION NOT NULL,      -- 0~1
  level    SMALLINT NOT NULL,              -- 1~5
  source   TEXT NOT NULL DEFAULT 'dummy',  -- dummy | model
  PRIMARY KEY (h3_index, ts)
);

CREATE INDEX h3_cell_geom_idx   ON h3_cell  USING GIST (geom);
CREATE INDEX h3_cell_center_idx ON h3_cell  USING GIST (center);
CREATE INDEX facility_geom_idx  ON facility USING GIST (geom);
CREATE INDEX risk_score_ts_idx  ON risk_score (ts DESC);
