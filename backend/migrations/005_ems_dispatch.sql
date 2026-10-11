-- 셀별 구급출동 건수 (제주소방안전본부 구급출동 현황, 사고발생 좌표 기준). 원본 행은 저장하지 않는다.
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/005_ems_dispatch.sql
CREATE TABLE IF NOT EXISTS cell_ems_count (
  h3_index VARCHAR(15) REFERENCES h3_cell ON DELETE CASCADE,
  year     INT NOT NULL,
  count    INT NOT NULL,
  PRIMARY KEY (h3_index, year)
);

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
       e.count                                  AS ems_count,
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
LEFT JOIN (
  SELECT h3_index, sum(count)::int AS count FROM cell_ems_count GROUP BY h3_index
) e ON e.h3_index = c.h3_index
LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = 'fire_station';
