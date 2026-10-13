-- 셀별 모델 입력자료 출처 (교통사고: road_source, feature_coverage, road_snapshot_date, island_map_year)
-- 2026-10-13 우도·추자도 포함 도로 모델(jeju_h3_r8_road_islands_its20260914_ngii2025_v1)부터 셀마다 출처가 다르다.
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/011_hazard_detail.sql
ALTER TABLE hazard_score ADD COLUMN IF NOT EXISTS detail JSONB NOT NULL DEFAULT '{}'::jsonb;
