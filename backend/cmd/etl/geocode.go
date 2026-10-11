package main

import (
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"jejurisk/internal/geo"
)

// 처리 결과 CSV 컬럼. 다른 시설(CCTV 등)도 이 형식으로 맞추면 facilities 를 그대로 재사용할 수 있다.
var geocodedHeader = []string{"type", "name", "address", "lat", "lng", "geocode_query"}

// runGeocode 는 원본 CSV 의 주소를 좌표로 바꿔 GeocodedPath 에 쓴다.
// 우선순위: OverridesPath(검증된 수동 좌표) > 기존 결과 파일의 좌표 > Nominatim 조회.
func runGeocode(ctx context.Context, verbose bool) error {
	raw, err := readCSV(RawFirePath)
	if err != nil {
		return err
	}
	existing := map[string][]string{}
	if prev, err := readCSV(GeocodedPath); err == nil {
		for _, r := range prev {
			if r["lat"] != "" && r["lng"] != "" {
				existing[r["name"]] = []string{r["lat"], r["lng"], r["geocode_query"]}
			}
		}
	}

	if ov, err := readCSV(OverridesPath); err == nil {
		for _, r := range ov {
			existing[r["name"]] = []string{r["lat"], r["lng"], "override: " + r["source"]}
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	g := geo.NewNominatim()
	out := [][]string{geocodedHeader}
	var failed []string
	for _, r := range raw {
		name, addr := r["name"], r["address"]
		if e, ok := existing[name]; ok {
			out = append(out, []string{FireStationTyp, name, addr, e[0], e[1], e[2]})
			continue
		}
		lat, lng, query, err := geocodeWithFallback(ctx, g, name, addr)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		row := []string{FireStationTyp, name, addr, "", "", ""}
		if query != "" {
			row[3] = strconv.FormatFloat(lat, 'f', 7, 64)
			row[4] = strconv.FormatFloat(lng, 'f', 7, 64)
			row[5] = query
		} else {
			failed = append(failed, name)
		}
		if verbose {
			log.Printf("%-16s %s,%s  ← %q", name, row[3], row[4], query)
		}
		out = append(out, row)
	}

	if err := writeCSV(GeocodedPath, out); err != nil {
		return err
	}
	log.Printf("geocode: %d건 → %s (실패 %d건)", len(out)-1, GeocodedPath, len(failed))
	if len(failed) > 0 {
		log.Printf("실패 목록(CSV 에서 lat,lng 직접 입력): %s", strings.Join(failed, ", "))
	}
	return nil
}

// 정규화 주소 → 센터명 → "제주 <도로명> <번호>" 순으로 시도한다.
func geocodeWithFallback(ctx context.Context, g geo.Geocoder, name, addr string) (float64, float64, string, error) {
	norm := geo.NormalizeAddress(addr)
	queries := []string{norm, "제주특별자치도 " + name}
	if f := strings.Fields(norm); len(f) >= 2 {
		queries = append(queries, "제주 "+strings.Join(f[len(f)-2:], " "))
	}
	for _, q := range queries {
		lat, lng, ok, err := g.Geocode(ctx, q)
		if err != nil {
			return 0, 0, "", err
		}
		if ok && geo.InJeju(lat, lng) {
			return lat, lng, q, nil
		}
	}
	return 0, 0, "", nil
}

func readCSV(path string) ([]map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	rows, err := csv.NewReader(f).ReadAll()
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if len(rows) == 0 {
		return nil, nil
	}
	header := rows[0]
	out := make([]map[string]string, 0, len(rows)-1)
	for _, r := range rows[1:] {
		m := make(map[string]string, len(header))
		for i, h := range header {
			if i < len(r) {
				m[h] = strings.TrimSpace(r[i])
			}
		}
		out = append(out, m)
	}
	return out, nil
}

func writeCSV(path string, rows [][]string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	if err := w.WriteAll(rows); err != nil {
		return err
	}
	return f.Close()
}
