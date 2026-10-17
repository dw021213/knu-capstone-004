// Package api 는 지도용 GeoJSON API 를 제공한다.
// GeoJSON 은 PostGIS 에서 완성해서 받아 그대로 내려준다(Go 에서 구조체로 다시 조립하지 않음).
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"jejurisk/internal/risk"
)

type Handler struct {
	DB               *pgxpool.Pool
	WeatherRulesPath string // config/weather_rules.json (요청마다 읽어 수정 즉시 반영)
}

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/health", h.health)
	r.GET("/risk/meta", h.riskMeta)
	r.GET("/grid", h.grid)
	r.GET("/cells/:h3", h.cell)
	r.GET("/facilities", h.facilities)
}

func (h *Handler) health(c *gin.Context) {
	if err := h.DB.Ping(c); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db down", "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

const riskLegend = "제주 상대 위험 순위 (모든 시간대 공통 기준)"

// slotOf 는 ?condition=&hour= 를 읽는다. 없으면 at(기본 지금) 시각 기준(요일 구분, 그 시간대).
// 잘못된 값이면 400 을 쓰고 ok=false.
func slotOf(c *gin.Context, at time.Time) (condition string, hour int, auto bool, ok bool) {
	condition, hour = risk.DefaultSlot(at)
	auto = true
	if v := c.Query("condition"); v != "" {
		if _, found := risk.ConditionByKey(v); !found {
			keys := make([]string, 0, len(risk.Conditions))
			for _, k := range risk.Conditions {
				keys = append(keys, k.Key)
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": "condition 은 " + strings.Join(keys, "|")})
			return "", 0, false, false
		}
		condition, auto = v, false
	}
	if v := c.Query("hour"); v != "" {
		h, err := strconv.Atoi(v)
		if err != nil || h < 0 || h > 23 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "hour 는 0~23"})
			return "", 0, false, false
		}
		hour, auto = h, false
	}
	return condition, hour, auto, true
}

// GET /api/risk/meta — 최종 위험도 계산 방식, 들어간 위험 모델, 유동인구 출처, 등급 구간, 제한사항
func (h *Handler) riskMeta(c *gin.Context) {
	type hazardInfo struct {
		Hazard       string          `json:"hazard"`
		Name         string          `json:"name"`
		Label        string          `json:"label"`
		DatasetID    string          `json:"dataset_id"`
		SnapshotDate *string         `json:"snapshot_date"`
		Limitations  json.RawMessage `json:"limitations"`
	}
	rows, err := h.DB.Query(c, `
		SELECT hazard, label, dataset_id, to_char(snapshot_date, 'YYYY-MM-DD'), COALESCE(metadata->'limitations', '[]')
		FROM hazard_meta ORDER BY hazard`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	hazards, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (hazardInfo, error) {
		var x hazardInfo
		err := r.Scan(&x.Hazard, &x.Label, &x.DatasetID, &x.SnapshotDate, &x.Limitations)
		x.Name = risk.HazardLabels[x.Hazard]
		return x, err
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var popStdYM *string
	if err := h.DB.QueryRow(c, `SELECT min(std_ym) FROM population_source`).Scan(&popStdYM); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defCond, defHour := risk.DefaultSlot(time.Now())
	var computedAt *time.Time
	if err := h.DB.QueryRow(c, `SELECT max(computed_at) FROM risk_combined`).Scan(&computedAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	levels := make([]gin.H, 0, len(risk.LevelBands))
	for _, b := range risk.LevelBands {
		levels = append(levels, gin.H{"level": b.Level, "label": b.Label, "min_percentile": b.MinPercentile})
	}
	c.JSON(http.StatusOK, gin.H{
		"version":         risk.Version,
		"computed_at":     computedAt,
		"legend":          riskLegend,
		"formula":         "최종 = 0.8 × 위해도(가용 위험 모델 백분위 평균) + 0.2 × 고립도(1 − 유동인구 백분위). 고립도·최종 순위는 모든 조건·시간대·셀을 한 줄로 세운 공통 기준",
		"weights":         gin.H{"hazard": risk.WeightHazard, "isolation": risk.WeightIsolation},
		"hazards":         hazards,
		"hazards_planned": risk.Hazards,
		"population": gin.H{
			"source":     "제주도민 250m 격자 시간대별 유동인구",
			"std_ym":     popStdYM,
			"assumption": "2015년 1월 제주도민 시간대별 유동인구(하루 평균으로 환산)를 현재 패턴으로 가정 (관광객 미포함)",
			"per_day":    "원본은 조건별 월 합계라 2015-01 달력 일수(전체 31·평일 16·휴일 10·휴일전날 5)로 나눔. 날씨 조건은 일수 자료가 없어 섬 전체 하루 인구를 '전체'와 같게 맞춤",
		},
		"conditions": risk.Conditions,
		"hours":      gin.H{"min": 0, "max": 23},
		"default_slot": gin.H{
			"condition": defCond, "hour": defHour,
			"rule": "condition·hour 를 안 주면 at(기본 지금) 한국 시각: 토·일=holiday, 금=preholiday, 그 외=weekday (공휴일 미반영)",
		},
		"levels":             levels,
		"weather":            h.weatherMeta(c),
		"no_data":            "위험 모델 입력자료가 없는 셀(예: 도로 자료 없는 셀)은 risk_* 가 null. 안전으로 표시하지 않는다",
		"isolation_toggle":   "유동인구(고립도) 반영: risk_percentile·risk_level / 끔(위해도만): hazard_percentile·hazard_level",
		"default_population": false, // 2026-10-15 기본 표시는 유동인구 끔(hazard_*). 사고 빈도와 고립도 방향이 반대라 근거가 약함
		"notes": []string{
			"risk_percentile 은 모든 조건·시간대·셀을 통틀어 매긴 상대 순위이며 사고 확률이 아니다. 시간대끼리 비교 가능(새벽이 낮보다 높게 나옴)",
			"위해도(도로 모델)는 고정, 고립도만 유동인구 조건·시간대에 따라 바뀐다. 실시간 관측이 아니라 2015-01 패턴이다",
			"hazard_percentile·hazard_level(유동인구 끔)은 도로 셀끼리의 순위로 시간대와 무관",
		},
	})
}

// 셀별 최종 위험도·구성요소 + 119 정보 (+ 백엔드 테스트용 더미 값). $1~$4 가 NULL 이면 전체.
const gridSQL = `
WITH dummy AS (
  SELECT DISTINCT ON (h3_index) h3_index, score, level
  FROM risk_score
  ORDER BY h3_index, ts DESC
), ems AS (
  SELECT h3_index, sum(count)::int AS count FROM cell_ems_count GROUP BY h3_index
), fac AS (
  -- 셀 안 시설 수 (종류별, 0 은 뺌)
  SELECT h3_index, json_object_agg(type, count_in_cell) AS counts
  FROM cell_facility_stat WHERE count_in_cell > 0 GROUP BY h3_index
), crowd AS (
  SELECT DISTINCT ON (h3_index) h3_index, value
  FROM congestion
  ORDER BY h3_index, ts DESC
)
SELECT json_build_object(
  'type', 'FeatureCollection',
  'risk', json_build_object('version', $5::text, 'legend', $6::text,
                            'condition', $7::text, 'hour', $8::int, 'auto_slot', $9::boolean),
  'weather', $11::jsonb,
  'features', COALESCE(json_agg(json_build_object(
    'type', 'Feature',
    -- D3(d3-geo)는 바깥 고리가 시계 방향이어야 해서 CW 로 내보낸다. Leaflet 은 방향과 무관.
    'geometry', ST_AsGeoJSON(ST_ForcePolygonCW(c.geom), 6)::json,
    'properties', json_build_object(
      'h3', c.h3_index,
      'risk_score', round(adj.s::numeric, 4),
      'risk_percentile', round(adj.pct::numeric, 2),
      'risk_level', adj.lvl,
      'hazard', round(rc.hazard::numeric, 4),
      'hazard_percentile', round(adj.hpct::numeric, 2),
      'hazard_level', adj.hlvl,
      'base_percentile', round(rc.percentile::numeric, 2),
      'base_level', rc.level,
      'base_hazard_percentile', round(rc.hazard_percentile::numeric, 2),
      'base_hazard_level', rc.hazard_level,
      'weather_bonus', CASE WHEN rc.score IS NULL THEN NULL ELSE round(w.bonus::numeric, 3) END,
      'weather_alerts', COALESCE(w.alerts, '[]'::jsonb),
      'weather_stn', cw.stn,
      'isolation', round(rc.isolation::numeric, 4),
      'traffic_percentile', round(ht.percentile::numeric, 2),
      'has_road', ht.available,
      'road_source', ht.detail->>'road_source',
      'facility_counts', COALESCE(fc.counts, '{}'::json),
      'population', round(p.population::numeric, 1),
      'fire_station_dist_m', round(s.nearest_dist_m::numeric),
      'fire_station_drive_min', round(s.nearest_drive_min::numeric, 1),
      'fire_station_k1', s.count_k1,
      'dummy_score', round(d.score::numeric, 3),
      'dummy_level', d.level,
      'ems_count', e.count,
      'congestion', round(g.value::numeric, 2)
    )
  )), '[]'::json)
)
FROM h3_cell c
LEFT JOIN risk_combined rc ON rc.h3_index = c.h3_index AND rc.condition = $7 AND rc.hour = $8
LEFT JOIN hazard_score ht ON ht.h3_index = c.h3_index AND ht.hazard = 'traffic'
LEFT JOIN cell_population_hourly p ON p.h3_index = c.h3_index AND p.condition = $7 AND p.hour = $8
LEFT JOIN dummy d ON d.h3_index = c.h3_index
LEFT JOIN crowd g ON g.h3_index = c.h3_index
LEFT JOIN ems e ON e.h3_index = c.h3_index
LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = 'fire_station'
LEFT JOIN fac fc ON fc.h3_index = c.h3_index
LEFT JOIN cell_weather_station cw ON cw.h3_index = c.h3_index
-- 기상 가산: 셀의 지점 판별 결과($10: 지점번호 → {bonus, alerts, …})
CROSS JOIN LATERAL (
  SELECT COALESCE(($10::jsonb -> cw.stn::text ->> 'bonus')::float8, 0) AS bonus,
         $10::jsonb -> cw.stn::text -> 'alerts' AS alerts
) w
CROSS JOIN LATERAL (
  SELECT LEAST(1, rc.score + w.bonus) AS s,
         CASE WHEN rc.score IS NULL THEN NULL WHEN w.bonus > 0 THEN risk_pct('combined', LEAST(1, rc.score + w.bonus)) ELSE rc.percentile END AS pct,
         CASE WHEN rc.score IS NULL THEN NULL WHEN w.bonus > 0 THEN risk_level(risk_pct('combined', LEAST(1, rc.score + w.bonus))) ELSE rc.level END AS lvl,
         CASE WHEN rc.hazard IS NULL THEN NULL WHEN w.bonus > 0 THEN risk_pct('hazard', LEAST(1, rc.hazard + w.bonus)) ELSE rc.hazard_percentile END AS hpct,
         CASE WHEN rc.hazard IS NULL THEN NULL WHEN w.bonus > 0 THEN risk_level(risk_pct('hazard', LEAST(1, rc.hazard + w.bonus))) ELSE rc.hazard_level END AS hlvl
) adj
WHERE $1::float8 IS NULL OR c.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`

// GET /api/grid?at=2021-08-23T14:00&condition=weekday&hour=21&weather=on&bbox=minLng,minLat,maxLng,maxLat
func (h *Handler) grid(c *gin.Context) {
	at, _, ok := atOf(c)
	if !ok {
		return
	}
	cond, hour, auto, ok := slotOf(c, at)
	if !ok {
		return
	}
	wx, wxInfo, err := h.weatherFor(c, at)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "기상 판별: " + err.Error()})
		return
	}
	info, _ := json.Marshal(wxInfo)
	args := []any{nil, nil, nil, nil, risk.Version, riskLegend, cond, hour, auto, string(wx), string(info)}
	if s := c.Query("bbox"); s != "" {
		parts := strings.Split(s, ",")
		if len(parts) != 4 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bbox=minLng,minLat,maxLng,maxLat"})
			return
		}
		for i, p := range parts {
			v, err := strconv.ParseFloat(strings.TrimSpace(p), 64)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "bbox 숫자 형식 오류: " + p})
				return
			}
			args[i] = v
		}
	}
	h.geojson(c, gridSQL, args...)
}

const facilitiesSQL = `
SELECT json_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(json_agg(json_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(geom, 6)::json,
    'properties', json_build_object(
      'id', id, 'ext_id', ext_id, 'type', type, 'name', name, 'address', address, 'h3', h3_index,
      'detail', detail, 'source', source)
  ) ORDER BY id), '[]'::json)
)
FROM facility
WHERE $1::text = '' OR type = $1`

// GET /api/facilities?type=fire_station
func (h *Handler) facilities(c *gin.Context) {
	h.geojson(c, facilitiesSQL, c.Query("type"))
}

const cellSQL = `
SELECT json_build_object(
  'h3', c.h3_index,
  'center', json_build_array(ST_X(c.center), ST_Y(c.center)),
  'risk', (SELECT json_build_object(
             'condition', condition, 'hour', hour, 'auto_slot', $5::boolean,
             'score', LEAST(1, score + w.bonus),
             'percentile', CASE WHEN score IS NULL THEN NULL WHEN w.bonus > 0 THEN risk_pct('combined', LEAST(1, score + w.bonus)) ELSE percentile END,
             'level', CASE WHEN score IS NULL THEN NULL WHEN w.bonus > 0 THEN risk_level(risk_pct('combined', LEAST(1, score + w.bonus))) ELSE level END,
             'hazard', hazard, 'isolation', isolation, 'hazards_used', hazards_used,
             'hazard_percentile', CASE WHEN hazard IS NULL THEN NULL WHEN w.bonus > 0 THEN risk_pct('hazard', LEAST(1, hazard + w.bonus)) ELSE hazard_percentile END,
             'hazard_level', CASE WHEN hazard IS NULL THEN NULL WHEN w.bonus > 0 THEN risk_level(risk_pct('hazard', LEAST(1, hazard + w.bonus))) ELSE hazard_level END,
             'base_score', score, 'base_percentile', percentile, 'base_level', level,
             'base_hazard_percentile', hazard_percentile, 'base_hazard_level', hazard_level,
             'weather_bonus', CASE WHEN score IS NULL THEN NULL ELSE w.bonus END,
             'version', $2::text, 'computed_at', computed_at)
           FROM risk_combined,
                LATERAL (SELECT COALESCE(($6::jsonb -> (SELECT stn::text FROM cell_weather_station WHERE h3_index = $1) ->> 'bonus')::float8, 0) AS bonus) w
           WHERE h3_index = c.h3_index AND condition = $3 AND hour = $4),
  -- 그 시각 셀의 기상 판별 (가장 가까운 AWS 지점)
  'weather', (SELECT jsonb_build_object('stn', cw.stn, 'dist_m', round(cw.dist_m::numeric)) || $7::jsonb
                     || COALESCE($6::jsonb -> cw.stn::text, '{}'::jsonb)
              FROM cell_weather_station cw WHERE cw.h3_index = c.h3_index),
  -- 같은 조건의 0~23시 순위 (시간대별 그래프용)
  'hourly', (SELECT COALESCE(json_agg(json_build_object(
               'hour', rc.hour, 'percentile', round(rc.percentile::numeric, 2), 'level', rc.level,
               'isolation', round(rc.isolation::numeric, 4), 'population', round(p.population::numeric, 1)) ORDER BY rc.hour), '[]'::json)
             FROM risk_combined rc
             LEFT JOIN cell_population_hourly p USING (h3_index, condition, hour)
             WHERE rc.h3_index = c.h3_index AND rc.condition = $3),
  'hazards', (SELECT COALESCE(json_object_agg(hs.hazard, json_build_object(
                'label', hm.label, 'percentile', hs.percentile, 'score', hs.score,
                'available', hs.available, 'dataset_id', hm.dataset_id, 'snapshot_date', hm.snapshot_date,
                'detail', hs.detail)), '{}'::json)
              FROM hazard_score hs JOIN hazard_meta hm USING (hazard) WHERE hs.h3_index = c.h3_index),
  'population', (SELECT json_build_object('value', round(p.population::numeric, 1), 'condition', p.condition, 'hour', p.hour,
                                         'std_ym', ps.std_ym, 'file', ps.file)
                 FROM cell_population_hourly p JOIN population_source ps USING (condition)
                 WHERE p.h3_index = c.h3_index AND p.condition = $3 AND p.hour = $4),
  'facilities', (SELECT COALESCE(json_object_agg(type, json_build_object(
                   'count_in_cell', count_in_cell, 'count_k1', count_k1,
                   'nearest_dist_m', round(nearest_dist_m::numeric),
                   'nearest_drive_min', round(nearest_drive_min::numeric, 1))), '{}'::json)
                 FROM cell_facility_stat WHERE h3_index = c.h3_index),
  'dummy', (SELECT json_build_object('score', score, 'level', level, 'ts', ts, 'source', source)
            FROM risk_score WHERE h3_index = c.h3_index ORDER BY ts DESC LIMIT 1),
  'ems', (SELECT COALESCE(json_object_agg(year, count), '{}'::json)
          FROM cell_ems_count WHERE h3_index = c.h3_index),
  'congestion', (SELECT json_build_object('value', round(value::numeric, 2), 'ts', ts, 'source', source)
                 FROM congestion WHERE h3_index = c.h3_index ORDER BY ts DESC LIMIT 1)
)
FROM h3_cell c WHERE c.h3_index = $1`

// GET /api/cells/:h3?at=&condition=&hour=&weather=
func (h *Handler) cell(c *gin.Context) {
	at, _, ok := atOf(c)
	if !ok {
		return
	}
	cond, hour, auto, ok := slotOf(c, at)
	if !ok {
		return
	}
	wx, wxInfo, err := h.weatherFor(c, at)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "기상 판별: " + err.Error()})
		return
	}
	info, _ := json.Marshal(wxInfo)
	var raw []byte
	err = h.DB.QueryRow(c, cellSQL, c.Param("h3"), risk.Version, cond, hour, auto, string(wx), string(info)).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "격자에 없는 셀"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", raw)
}

func (h *Handler) geojson(c *gin.Context, sql string, args ...any) {
	var raw []byte
	if err := h.DB.QueryRow(c, sql, args...).Scan(&raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/geo+json; charset=utf-8", raw)
}
