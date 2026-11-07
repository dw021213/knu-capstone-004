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
	SafetyRulesPath  string // config/safety_rules.json (요청마다 읽음, 비우면 안전시설 지수 끔)
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

const riskLegend = "제주 상대 위험 순위 (도로 격자 기준)"

// Version 은 응답의 위험도 산출 방식. 2026-10-17 유동인구(고립도)를 빼고 모델 위험점수 + 기상 가산만 쓴다.
const Version = "traffic_weather_v1"

// GET /api/risk/meta — 최종 위험도 계산 방식, 들어간 위험 모델, 등급 구간, 기상 기준, 제한사항
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
	var computedAt *time.Time
	if err := h.DB.QueryRow(c, `SELECT max(loaded_at) FROM hazard_meta`).Scan(&computedAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	levels := make([]gin.H, 0, len(risk.LevelBands))
	for _, b := range risk.LevelBands {
		levels = append(levels, gin.H{"level": b.Level, "label": b.Label, "min_percentile": b.MinPercentile})
	}
	c.JSON(http.StatusOK, gin.H{
		"version":         Version,
		"computed_at":     computedAt,
		"legend":          riskLegend,
		"formula":         "최종 = min(1, 모델 위험점수 + 기상 가산). 모델 위험점수 = 위험 모델 백분위/100 (현재 교통사고 도로 모델 하나). 순위는 가산 전 모델 점수 분포에 대어 다시 매김",
		"fields":          "risk_* = 기상 가산 반영(지도 색, ?safety=on 이면 안전시설 감산도), base_* = 가산 전 모델 점수, weather_bonus = 가산점, safety_score = 인근 안전시설 지수(0~1, 높을수록 안전), safety_cut = 뺀 값",
		"hazards":         hazards,
		"hazards_planned": risk.Hazards,
		"levels":          levels,
		"weather":         h.weatherMeta(c),
		"safety":          h.safetyMeta(),
		"fall":            h.fallMeta(c),
		"no_data":         "위험 모델 입력자료가 없는 셀(예: 도로 자료 없는 셀)은 risk_*·base_* 가 null. 안전으로 표시하지 않는다",
		"notes": []string{
			"risk_percentile 은 도로 격자끼리의 상대 순위이며 사고 확률이 아니다",
			"모델 위험점수는 날짜와 무관한 고정값이고, 시간에 따라 바뀌는 것은 at 시각의 기상 관측 기반 가산뿐이다 (예측 아님)",
			"유동인구(고립도)는 2026-10-17 제외 (2021 사고 자료에서 '한산할수록 위험' 효과 없음)",
			"hazard_percentile·hazard_level 은 risk_percentile·risk_level 과 같은 값 (예전 프론트 호환용, 새 코드는 risk_* 사용)",
		},
	})
}

// 셀별 최종 위험도(모델 위험점수 + 기상 가산 [− 안전시설 감산]) + 시설·119 정보 (+ 백엔드 테스트용 더미 값). $1~$4 가 NULL 이면 전체.
var gridSQL = `
WITH hz AS (
  -- 모델 위험점수: 입력자료가 있는 위험 모델 백분위의 평균 (현재 교통사고 하나)
  SELECT h3_index, avg(percentile) / 100 AS score, array_agg(hazard ORDER BY hazard) AS used
  FROM hazard_score WHERE available AND percentile IS NOT NULL GROUP BY h3_index
), dummy AS (
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
), ` + safetyCTE("$9") + `
SELECT json_build_object(
  'type', 'FeatureCollection',
  'risk', json_build_object('version', $5::text, 'legend', $6::text),
  'weather', $8::jsonb,
  'safety', $10::jsonb,
  'fall', $12::jsonb,
  'features', COALESCE(json_agg(json_build_object(
    'type', 'Feature',
    -- D3(d3-geo)는 바깥 고리가 시계 방향이어야 해서 CW 로 내보낸다. Leaflet 은 방향과 무관.
    'geometry', ST_AsGeoJSON(ST_ForcePolygonCW(c.geom), 6)::json,
    'properties', json_build_object(
      'h3', c.h3_index,
      'risk_score', round(adj.s::numeric, 4),
      'risk_percentile', round(adj.pct::numeric, 2),
      'risk_level', adj.lvl,
      'base_score', round(hz.score::numeric, 4),
      'base_percentile', round(base.pct::numeric, 2),
      'base_level', risk_level(base.pct),
      'hazard_percentile', round(adj.pct::numeric, 2),
      'hazard_level', adj.lvl,
      'weather_bonus', CASE WHEN hz.score IS NULL THEN NULL ELSE round(w.bonus::numeric, 3) END,
      'weather_alerts', COALESCE(w.alerts, '[]'::jsonb),
      'weather_stn', cw.stn,
      'safety_score', round(sf.score::numeric, 3),
      'safety_cut', CASE WHEN hz.score IS NULL THEN NULL ELSE round(sa.cut::numeric, 3) END,
      'safety_detail', sf.detail,
      'fall_score', round(fs.score::numeric, 5),
      'fall_percentile', round(fs.percentile::numeric, 2),
      'fall_level', risk_level(fs.percentile),
      'traffic_percentile', round(ht.percentile::numeric, 2),
      'has_road', ht.available,
      'road_source', ht.detail->>'road_source',
      'facility_counts', COALESCE(fc.counts, '{}'::json),
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
LEFT JOIN hz ON hz.h3_index = c.h3_index
LEFT JOIN hazard_score ht ON ht.h3_index = c.h3_index AND ht.hazard = 'traffic'
LEFT JOIN dummy d ON d.h3_index = c.h3_index
LEFT JOIN crowd g ON g.h3_index = c.h3_index
LEFT JOIN ems e ON e.h3_index = c.h3_index
LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = 'fire_station'
LEFT JOIN fac fc ON fc.h3_index = c.h3_index
LEFT JOIN cell_weather_station cw ON cw.h3_index = c.h3_index
LEFT JOIN sf ON sf.h3_index = c.h3_index
-- 넘어짐·추락: $11 예측 날짜 (교통사고 위험도와 섞지 않음)
LEFT JOIN fall_score fs ON fs.h3_index = c.h3_index AND fs.prediction_date = $11::date
-- 기상 가산: 셀의 지점 판별 결과($7: 지점번호 → {bonus, alerts, …})
CROSS JOIN LATERAL (
  SELECT COALESCE(($7::jsonb -> cw.stn::text ->> 'bonus')::float8, 0) AS bonus,
         $7::jsonb -> cw.stn::text -> 'alerts' AS alerts
) w
-- 안전시설 감산: alpha($9, ?safety=on 아니면 0) × 지수
CROSS JOIN LATERAL (SELECT ($9::jsonb ->> 'alpha')::float8 * COALESCE(sf.score, 0) AS cut) sa
CROSS JOIN LATERAL (SELECT 100 * hz.score AS pct) base
CROSS JOIN LATERAL (SELECT GREATEST(0, LEAST(1, hz.score + w.bonus) - sa.cut) AS s) fin
CROSS JOIN LATERAL (
  SELECT fin.s,
         CASE WHEN hz.score IS NULL THEN NULL WHEN fin.s = hz.score THEN base.pct ELSE risk_pct('hazard', fin.s) END AS pct
) adj0
CROSS JOIN LATERAL (SELECT adj0.s, adj0.pct, risk_level(adj0.pct) AS lvl) adj
WHERE $1::float8 IS NULL OR c.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`

// GET /api/grid?at=2026-10-17T14:00&weather=on&safety=on&bbox=minLng,minLat,maxLng,maxLat
func (h *Handler) grid(c *gin.Context) {
	at, _, ok := atOf(c)
	if !ok {
		return
	}
	wx, wxInfo, err := h.weatherFor(c, at)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "기상 판별: " + err.Error()})
		return
	}
	info, _ := json.Marshal(wxInfo)
	sp, spInfo, err := h.safetyFor(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "안전시설 규칙: " + err.Error()})
		return
	}
	sinfo, _ := json.Marshal(spInfo)
	fd, fInfo, err := h.fallFor(c, at)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "넘어짐 예측: " + err.Error()})
		return
	}
	finfo, _ := json.Marshal(fInfo)
	args := []any{nil, nil, nil, nil, Version, riskLegend, string(wx), string(info), string(sp), string(sinfo), fd, string(finfo)}
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

var cellSQL = `
WITH ` + safetyCTE("$5") + `
SELECT json_build_object(
  'h3', c.h3_index,
  'center', json_build_array(ST_X(c.center), ST_Y(c.center)),
  'risk', (SELECT json_build_object(
             'score', fin.s,
             'percentile', fin.pct,
             'level', risk_level(fin.pct),
             'base_score', hz.score, 'base_percentile', 100 * hz.score, 'base_level', risk_level(100 * hz.score),
             'weather_bonus', w.bonus, 'safety_cut', sa.cut, 'hazards_used', hz.used,
             'version', $2::text)
           FROM (SELECT avg(percentile) / 100 AS score, array_agg(hazard ORDER BY hazard) AS used
                 FROM hazard_score WHERE h3_index = c.h3_index AND available AND percentile IS NOT NULL
                 HAVING count(*) > 0) hz,
                LATERAL (SELECT COALESCE(($3::jsonb -> (SELECT stn::text FROM cell_weather_station WHERE h3_index = $1) ->> 'bonus')::float8, 0) AS bonus) w,
                LATERAL (SELECT ($5::jsonb ->> 'alpha')::float8 * COALESCE((SELECT score FROM sf WHERE h3_index = $1), 0) AS cut) sa,
                LATERAL (SELECT x.s, CASE WHEN x.s = hz.score THEN 100 * hz.score ELSE risk_pct('hazard', x.s) END AS pct
                         FROM (SELECT GREATEST(0, LEAST(1, hz.score + w.bonus) - sa.cut) AS s) x) fin),
  -- 인근 안전시설 지수 (0~1, 높을수록 안전)
  'safety', (SELECT jsonb_build_object('score', round(sf.score::numeric, 3), 'detail', sf.detail) || $6::jsonb
             FROM sf WHERE sf.h3_index = c.h3_index),
  -- 넘어짐·추락 ($7 예측 날짜, $8 요약). 교통사고 risk 와 별개
  'fall', (SELECT jsonb_build_object('score', fs.score, 'percentile', fs.percentile, 'level', risk_level(fs.percentile),
                                     'rank', fs.rank, 'display_eligible', fs.display_eligible, 'quality', fs.quality) || $8::jsonb
           FROM fall_score fs WHERE fs.h3_index = c.h3_index AND fs.prediction_date = $7::date),
  -- 그 시각 셀의 기상 판별 (가장 가까운 AWS 지점)
  'weather', (SELECT jsonb_build_object('stn', cw.stn, 'dist_m', round(cw.dist_m::numeric)) || $4::jsonb
                     || COALESCE($3::jsonb -> cw.stn::text, '{}'::jsonb)
              FROM cell_weather_station cw WHERE cw.h3_index = c.h3_index),
  'hazards', (SELECT COALESCE(json_object_agg(hs.hazard, json_build_object(
                'label', hm.label, 'percentile', hs.percentile, 'score', hs.score,
                'available', hs.available, 'dataset_id', hm.dataset_id, 'snapshot_date', hm.snapshot_date,
                'detail', hs.detail)), '{}'::json)
              FROM hazard_score hs JOIN hazard_meta hm USING (hazard) WHERE hs.h3_index = c.h3_index),
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

// GET /api/cells/:h3?at=&weather=&safety=
func (h *Handler) cell(c *gin.Context) {
	at, _, ok := atOf(c)
	if !ok {
		return
	}
	wx, wxInfo, err := h.weatherFor(c, at)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "기상 판별: " + err.Error()})
		return
	}
	info, _ := json.Marshal(wxInfo)
	sp, spInfo, err := h.safetyFor(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "안전시설 규칙: " + err.Error()})
		return
	}
	sinfo, _ := json.Marshal(spInfo)
	fd, fInfo, err := h.fallFor(c, at)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "넘어짐 예측: " + err.Error()})
		return
	}
	finfo, _ := json.Marshal(fInfo)
	var raw []byte
	err = h.DB.QueryRow(c, cellSQL, c.Param("h3"), Version, string(wx), string(info), string(sp), string(sinfo), fd, string(finfo)).Scan(&raw)
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
