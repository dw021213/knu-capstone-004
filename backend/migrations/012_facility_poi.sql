-- 시설 POI 확장: CCTV·편의점·숙박·경찰서·응급실 (프론트 frontend/public/data/poi/*.json 과 같은 원천)
-- CCTV 는 이름(설치 주소)이 겹치는 항목이 있어 (type, name) 대신 원천 ID(ext_id)로 구분한다.
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/012_facility_poi.sql
ALTER TABLE facility ADD COLUMN IF NOT EXISTS ext_id TEXT;
ALTER TABLE facility ADD COLUMN IF NOT EXISTS detail JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE facility ADD COLUMN IF NOT EXISTS source TEXT;
UPDATE facility SET ext_id = name WHERE ext_id IS NULL;
ALTER TABLE facility ALTER COLUMN ext_id SET NOT NULL;
ALTER TABLE facility DROP CONSTRAINT IF EXISTS facility_type_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS facility_type_ext_id ON facility (type, ext_id);
CREATE INDEX IF NOT EXISTS facility_type ON facility (type);
