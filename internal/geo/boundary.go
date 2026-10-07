// Package geo 는 경계 폴리곤, H3 변환, 지오코딩을 담당한다.
//
// 좌표 순서 주의: h3-go 는 (Lat, Lng), GeoJSON/PostGIS/orb 는 [lng, lat].
package geo

import (
	"fmt"
	"os"

	"github.com/paulmach/orb"
	"github.com/paulmach/orb/geojson"
	"github.com/uber/h3-go/v4"
)

// LoadBoundary 는 GeoJSON FeatureCollection 에서 properties[key]==value 인 피처의 MultiPolygon 을 읽는다.
func LoadBoundary(path, key, value string) (orb.MultiPolygon, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	fc, err := geojson.UnmarshalFeatureCollection(raw)
	if err != nil {
		return nil, fmt.Errorf("geojson 파싱 실패: %w", err)
	}
	for _, f := range fc.Features {
		if fmt.Sprint(f.Properties[key]) != value {
			continue
		}
		switch g := f.Geometry.(type) {
		case orb.MultiPolygon:
			return g, nil
		case orb.Polygon:
			return orb.MultiPolygon{g}, nil
		default:
			return nil, fmt.Errorf("지원하지 않는 geometry: %s", g.GeoJSONType())
		}
	}
	return nil, fmt.Errorf("%s=%s 피처를 찾을 수 없음", key, value)
}

// PolygonToCells 는 경계에 조금이라도 걸치는 H3 셀을 모두 반환한다(중복 제거).
// 경계 데이터가 거칠어서 중심점 기준으로 하면 해안 셀이 빠지기 때문에 Overlapping 모드를 쓴다.
func PolygonToCells(mp orb.MultiPolygon, res int) ([]h3.Cell, error) {
	seen := map[h3.Cell]struct{}{}
	var out []h3.Cell
	for _, poly := range mp {
		gp := h3.GeoPolygon{GeoLoop: toLoop(poly[0])}
		for _, hole := range poly[1:] {
			gp.Holes = append(gp.Holes, toLoop(hole))
		}
		cells, err := h3.PolygonToCellsExperimental(gp, res, h3.ContainmentOverlapping)
		if err != nil {
			return nil, err
		}
		for _, c := range cells {
			if _, ok := seen[c]; !ok {
				seen[c] = struct{}{}
				out = append(out, c)
			}
		}
	}
	return out, nil
}

func toLoop(r orb.Ring) h3.GeoLoop {
	loop := make(h3.GeoLoop, 0, len(r))
	for _, p := range r {
		loop = append(loop, h3.NewLatLng(p.Lat(), p.Lon()))
	}
	return loop
}

// CellPolygon 은 H3 셀 경계를 닫힌 orb.Polygon([lng,lat])으로 만든다.
func CellPolygon(c h3.Cell) (orb.Polygon, error) {
	b, err := c.Boundary()
	if err != nil {
		return nil, err
	}
	ring := make(orb.Ring, 0, len(b)+1)
	for _, ll := range b {
		ring = append(ring, orb.Point{ll.Lng, ll.Lat})
	}
	ring = append(ring, ring[0])
	return orb.Polygon{ring}, nil
}

// CellCenter 는 셀 중심을 orb.Point([lng,lat])로 반환한다.
func CellCenter(c h3.Cell) (orb.Point, error) {
	ll, err := c.LatLng()
	if err != nil {
		return orb.Point{}, err
	}
	return orb.Point{ll.Lng, ll.Lat}, nil
}
