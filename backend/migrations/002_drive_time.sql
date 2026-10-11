-- 최근접 시설까지 예상 차량 주행시간(분). 현재는 직선거리 근사(internal/geo/drive.go).
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/002_drive_time.sql
ALTER TABLE cell_facility_stat ADD COLUMN IF NOT EXISTS nearest_drive_min DOUBLE PRECISION;
