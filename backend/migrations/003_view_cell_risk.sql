-- 셀 + 최신 위험도 + 119 집계를 한 번에 보는 뷰 (DBeaver 등에서 조회용)
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/003_view_cell_risk.sql
CREATE OR REPLACE VIEW v_cell_risk AS
SELECT c.h3_index,
       r.level,
       round(r.score::numeric, 3)               AS score,
       r.source,
       r.ts,
       round(s.nearest_drive_min::numeric, 1)   AS fire_drive_min,
       round(s.nearest_dist_m::numeric)         AS fire_dist_m,
       s.count_k1                               AS fire_count_k1,
       c.center,
       c.geom
FROM h3_cell c
LEFT JOIN LATERAL (
  SELECT level, score, source, ts FROM risk_score
  WHERE h3_index = c.h3_index ORDER BY ts DESC LIMIT 1
) r ON true
LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = 'fire_station';
