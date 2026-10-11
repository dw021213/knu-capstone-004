-- 셀별 혼잡도 (0~1). 나중에 실시간 수집기가 source='live' 로, 테스트는 source='test' 로 넣는다.
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/004_congestion.sql
CREATE TABLE IF NOT EXISTS congestion (
  h3_index VARCHAR(15) REFERENCES h3_cell ON DELETE CASCADE,
  ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  value    DOUBLE PRECISION NOT NULL,     -- 0(한산) ~ 1(매우 혼잡)
  source   TEXT NOT NULL,                 -- test | live
  PRIMARY KEY (h3_index, ts)
);
CREATE INDEX IF NOT EXISTS congestion_ts_idx ON congestion (ts DESC);

-- v_cell_risk 에 최신 혼잡도 추가
DROP VIEW IF EXISTS v_cell_risk;
CREATE VIEW v_cell_risk AS
SELECT c.h3_index,
       r.level,
       round(r.score::numeric, 3)               AS score,
       r.source,
       r.ts,
       round(s.nearest_drive_min::numeric, 1)   AS fire_drive_min,
       round(s.nearest_dist_m::numeric)         AS fire_dist_m,
       s.count_k1                               AS fire_count_k1,
       round(g.value::numeric, 2)               AS congestion,
       c.center,
       c.geom
FROM h3_cell c
LEFT JOIN LATERAL (
  SELECT level, score, source, ts FROM risk_score
  WHERE h3_index = c.h3_index ORDER BY ts DESC LIMIT 1
) r ON true
LEFT JOIN LATERAL (
  SELECT value FROM congestion
  WHERE h3_index = c.h3_index ORDER BY ts DESC LIMIT 1
) g ON true
LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = 'fire_station';
