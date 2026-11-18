-- v4 확률 → 등급(1~5). cuts = config/v4_levels.json 의 [c10, c30, c70, c90] (전체 기간 고정 경계).
-- 값이 null 이거나 cuts 가 없으면 null.
CREATE OR REPLACE FUNCTION v4_level(p_val DOUBLE PRECISION, p_cuts JSONB) RETURNS SMALLINT AS $$
  SELECT CASE WHEN p_val IS NULL OR p_cuts IS NULL OR jsonb_typeof(p_cuts) <> 'array' THEN NULL
              ELSE (1 + (SELECT count(*) FROM jsonb_array_elements_text(p_cuts) c WHERE p_val >= c::float8))::smallint END
$$ LANGUAGE sql IMMUTABLE;
