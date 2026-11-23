-- v4 확률 → 등급(1~5, 1 매우 안전 … 5 매우 위험). cuts = config/v4_levels.json 의 경계 4개 (전체 기간 고정, 행안부 비율 10/25/30/25/10).
-- 값이 null 이거나 cuts 가 없으면 null.
CREATE OR REPLACE FUNCTION v4_level(p_val DOUBLE PRECISION, p_cuts JSONB) RETURNS SMALLINT AS $$
  SELECT CASE WHEN p_val IS NULL OR p_cuts IS NULL OR jsonb_typeof(p_cuts) <> 'array' THEN NULL
              ELSE (1 + (SELECT count(*) FROM jsonb_array_elements_text(p_cuts) c WHERE p_val >= c::float8))::smallint END
$$ LANGUAGE sql IMMUTABLE;

-- v4 확률 → 전체 기간 참조 분포에서의 백분위(0~100). p_q = 0·1·…·100 백분위 값 101개(오름차순, config/v4_levels.json quantiles).
-- 사이 값은 선형 보간. 안전 점수 = 100 − 이 값 (높을수록 안전).
CREATE OR REPLACE FUNCTION v4_pct(p_val DOUBLE PRECISION, p_q JSONB) RETURNS DOUBLE PRECISION AS $$
  SELECT CASE
    WHEN p_val IS NULL OR p_q IS NULL OR jsonb_typeof(p_q) <> 'array' OR jsonb_array_length(p_q) <> 101 THEN NULL
    WHEN p_val <= (p_q ->> 0)::float8 THEN 0
    WHEN p_val >= (p_q ->> 100)::float8 THEN 100
    ELSE (SELECT i + COALESCE((p_val - lo) / NULLIF(hi - lo, 0), 0)
          FROM (SELECT i, (p_q ->> i)::float8 AS lo, (p_q ->> (i + 1))::float8 AS hi FROM generate_series(0, 99) i) s
          WHERE p_val >= lo AND p_val < hi ORDER BY i DESC LIMIT 1)
  END
$$ LANGUAGE sql IMMUTABLE;
