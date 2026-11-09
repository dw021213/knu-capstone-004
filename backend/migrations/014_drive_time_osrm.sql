-- 최근접 시설까지 실제 도로 기준 주행시간(OSRM). etl drive-time 이 계산해 data/processed/drive_time_osrm.csv 로 남기고,
-- etl drive-apply(또는 stats 끝)에서 cell_facility_stat 에 덮어쓴다. 서버 기동 시에도 실행(IF NOT EXISTS, 이미 있으면 그대로).
ALTER TABLE cell_facility_stat ADD COLUMN IF NOT EXISTS nearest_road_m DOUBLE PRECISION;  -- 도로 거리(m)
ALTER TABLE cell_facility_stat ADD COLUMN IF NOT EXISTS nearest_snap_m DOUBLE PRECISION;  -- 셀 중심 → 가장 가까운 도로까지 직선(m). 300m 넘는 만큼 걷기 4km/h 를 주행시간에 더함
ALTER TABLE cell_facility_stat ADD COLUMN IF NOT EXISTS nearest_name   TEXT;              -- 주행시간 기준 최근접 시설 이름
ALTER TABLE cell_facility_stat ADD COLUMN IF NOT EXISTS drive_source   TEXT NOT NULL DEFAULT 'straight'; -- straight(직선×1.3÷40km/h) | osrm
