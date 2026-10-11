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
	DB *pgxpool.Pool
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

const riskLegend = "제주 셀 간 상대 위험 순위"

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
	var popSource *string
	if err := h.DB.QueryRow(c, `SELECT source FROM cell_population LIMIT 1`).Scan(&popSource); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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
		"formula":         "최종 = 0.8 × 위해도(가용 위험 모델 백분위 평균) + 0.2 × 고립도(1 − 유동인구 백분위)",
		"weights":         gin.H{"hazard": risk.WeightHazard, "isolation": risk.WeightIsolation},
		"hazards":         hazards,
		"hazards_planned": risk.Hazards,
		"population": gin.H{
			"source":     popSource,
			"assumption": "2015년 제주도민 유동인구 분포를 현재 패턴으로 가정 (관광객 미포함)",
		},
		"levels":           levels,
		"no_data":          "위험 모델 입력자료가 없는 셀(예: 도로 자료 없는 셀)은 risk_* 가 null. 안전으로 표시하지 않는다",
		"isolation_toggle": "유동인구(고립도) 반영: risk_percentile·risk_level / 끔(위해도만): hazard_percentile·hazard_level",
		"notes": []string{
			"risk_percentile 은 셀 간 상대 순위이며 사고 확률이 아니다",
			"날짜·시간에 따라 바뀌는 예측이 아니라 현재 도로 자료와 유동인구 분포 기준의 고정 점수다",
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
), crowd AS (
  SELECT DISTINCT ON (h3_index) h3_index, value
  FROM congestion
  ORDER BY h3_index, ts DESC
)
SELECT json_build_object(
  'type', 'FeatureCollection',
  'risk', json_build_object('version', $5::text, 'legend', $6::text),
  'features', COALESCE(json_agg(json_build_object(
    'type', 'Feature',
    -- D3(d3-geo)는 바깥 고리가 시계 방향이어야 해서 CW 로 내보낸다. Leaflet 은 방향과 무관.
    'geometry', ST_AsGeoJSON(ST_ForcePolygonCW(c.geom), 6)::json,
    'properties', json_build_object(
      'h3', c.h3_index,
      'risk_score', round(rc.score::numeric, 4),
      'risk_percentile', round(rc.percentile::numeric, 2),
      'risk_level', rc.level,
      'hazard', round(rc.hazard::numeric, 4),
      'hazard_percentile', round(rc.hazard_percentile::numeric, 2),
      'hazard_level', rc.hazard_level,
      'isolation', round(rc.isolation::numeric, 4),
      'traffic_percentile', round(ht.percentile::numeric, 2),
      'has_road', ht.available,
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
LEFT JOIN risk_combined rc ON rc.h3_index = c.h3_index
LEFT JOIN hazard_score ht ON ht.h3_index = c.h3_index AND ht.hazard = 'traffic'
LEFT JOIN cell_population p ON p.h3_index = c.h3_index
LEFT JOIN dummy d ON d.h3_index = c.h3_index
LEFT JOIN crowd g ON g.h3_index = c.h3_index
LEFT JOIN ems e ON e.h3_index = c.h3_index
LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = 'fire_station'
WHERE $1::float8 IS NULL OR c.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`

// GET /api/grid?bbox=minLng,minLat,maxLng,maxLat
func (h *Handler) grid(c *gin.Context) {
	args := []any{nil, nil, nil, nil, risk.Version, riskLegend}
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
      'id', id, 'type', type, 'name', name, 'address', address, 'h3', h3_index)
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
             'score', score, 'percentile', percentile, 'level', level,
             'hazard', hazard, 'isolation', isolation, 'hazards_used', hazards_used,
             'hazard_percentile', hazard_percentile, 'hazard_level', hazard_level,
             'version', $2::text, 'computed_at', computed_at)
           FROM risk_combined WHERE h3_index = c.h3_index),
  'hazards', (SELECT COALESCE(json_object_agg(hs.hazard, json_build_object(
                'label', hm.label, 'percentile', hs.percentile, 'score', hs.score,
                'available', hs.available, 'dataset_id', hm.dataset_id, 'snapshot_date', hm.snapshot_date)), '{}'::json)
              FROM hazard_score hs JOIN hazard_meta hm USING (hazard) WHERE hs.h3_index = c.h3_index),
  'population', (SELECT json_build_object('value', round(population::numeric, 1), 'n_250m', n_250m, 'source', source)
                 FROM cell_population WHERE h3_index = c.h3_index),
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

// GET /api/cells/:h3
func (h *Handler) cell(c *gin.Context) {
	var raw []byte
	err := h.DB.QueryRow(c, cellSQL, c.Param("h3"), risk.Version).Scan(&raw)
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
