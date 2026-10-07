// Package api 는 지도용 GeoJSON API 를 제공한다.
// GeoJSON 은 PostGIS 에서 완성해서 받아 그대로 내려준다(Go 에서 구조체로 다시 조립하지 않음).
package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	DB *pgxpool.Pool
}

func (h *Handler) Register(r gin.IRouter) {
	r.GET("/health", h.health)
	r.GET("/grid", h.grid)
	r.GET("/facilities", h.facilities)
	r.GET("/cells/:h3", h.cell)
}

func (h *Handler) health(c *gin.Context) {
	if err := h.DB.Ping(c); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db down", "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// 셀별 최신 위험도·혼잡도·구급출동 건수 + 119 최근접 거리·예상 주행시간. $1~$4 가 NULL 이면 전체.
const gridSQL = `
WITH latest AS (
  SELECT DISTINCT ON (h3_index) h3_index, score, level, ts
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
  'features', COALESCE(json_agg(json_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(c.geom, 6)::json,
    'properties', json_build_object(
      'h3', c.h3_index,
      'score', round(r.score::numeric, 3),
      'level', r.level,
      'ts', r.ts,
      'fire_station_dist_m', round(s.nearest_dist_m::numeric),
      'fire_station_drive_min', round(s.nearest_drive_min::numeric, 1),
      'fire_station_k1', s.count_k1,
      'congestion', round(g.value::numeric, 2),
      'ems_count', e.count
    )
  )), '[]'::json)
)
FROM h3_cell c
LEFT JOIN latest r ON r.h3_index = c.h3_index
LEFT JOIN crowd g ON g.h3_index = c.h3_index
LEFT JOIN ems e ON e.h3_index = c.h3_index
LEFT JOIN cell_facility_stat s ON s.h3_index = c.h3_index AND s.type = 'fire_station'
WHERE $1::float8 IS NULL OR c.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`

// GET /api/grid?bbox=minLng,minLat,maxLng,maxLat
func (h *Handler) grid(c *gin.Context) {
	var args [4]any
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
	h.geojson(c, gridSQL, args[:]...)
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
  'risk', (SELECT json_build_object('score', score, 'level', level, 'ts', ts, 'source', source)
           FROM risk_score WHERE h3_index = c.h3_index ORDER BY ts DESC LIMIT 1),
  'congestion', (SELECT json_build_object('value', round(value::numeric, 2), 'ts', ts, 'source', source)
                 FROM congestion WHERE h3_index = c.h3_index ORDER BY ts DESC LIMIT 1),
  'ems', (SELECT COALESCE(json_object_agg(year, count), '{}'::json)
          FROM cell_ems_count WHERE h3_index = c.h3_index),
  'facilities', (SELECT COALESCE(json_object_agg(type, json_build_object(
                   'count_in_cell', count_in_cell, 'count_k1', count_k1,
                   'nearest_dist_m', round(nearest_dist_m::numeric),
                   'nearest_drive_min', round(nearest_drive_min::numeric, 1))), '{}'::json)
                 FROM cell_facility_stat WHERE h3_index = c.h3_index)
)
FROM h3_cell c WHERE c.h3_index = $1`

// GET /api/cells/:h3
func (h *Handler) cell(c *gin.Context) {
	var raw []byte
	err := h.DB.QueryRow(c, cellSQL, c.Param("h3")).Scan(&raw)
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
