-- 유동인구(고립도) 끄기용: 위해도만으로 매긴 순위·등급도 함께 저장
-- 이미 떠 있는 DB 에는: docker exec -i jeju-risk-db psql -U jeju -d jeju < migrations/007_hazard_only_rank.sql
ALTER TABLE risk_combined ADD COLUMN IF NOT EXISTS hazard_percentile REAL;  -- 0~100, 위해도만의 셀 간 순위
ALTER TABLE risk_combined ADD COLUMN IF NOT EXISTS hazard_level SMALLINT;   -- 1~5, 같은 경계(90/70/30/10)
