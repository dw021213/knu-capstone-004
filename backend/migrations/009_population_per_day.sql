-- 시간대별 유동인구 파일 값은 해당 조건의 날들을 합한 월 합계다(평일+휴일+휴일전날 = 전체).
-- 조건끼리 비교되도록 하루 평균으로 나눈다. 나눈 값과 근거를 기록한다.
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/009_population_per_day.sql
ALTER TABLE population_source ADD COLUMN IF NOT EXISTS days REAL;        -- cell_population_hourly 값 = 원본 합계 / days
ALTER TABLE population_source ADD COLUMN IF NOT EXISTS days_basis TEXT;  -- days 를 정한 근거
