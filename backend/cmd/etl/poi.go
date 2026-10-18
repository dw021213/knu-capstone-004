package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/uber/h3-go/v4"
)

// POITypes 는 프론트 POI 파일 이름(= facility.type). 119(fire_station)는 `etl facilities` 가 따로 넣는다.
var POITypes = []string{"cctv", "convenience", "lodging", "police", "er"}

// poiFile 은 frontend/public/data/poi/<type>.json 형식 (frontend/scripts/build-poi.mjs 가 만든다).
type poiFile struct {
	Type   string `json:"type"`
	Source string `json:"source"`
	Items  []struct {
		ID     string         `json:"id"`
		Name   string         `json:"name"`
		Lat    float64        `json:"lat"`
		Lng    float64        `json:"lng"`
		Detail map[string]any `json:"detail"`
	} `json:"items"`
}

// runPOI 는 프론트와 같은 POI 파일로 facility 를 종류별로 통째로 바꾸고 셀별 시설 통계를 다시 계산한다.
//
//	go run ./cmd/etl poi ../frontend/public/data/poi
func runPOI(ctx context.Context, pool *pgxpool.Pool, dir string) error {
	batch := &pgx.Batch{}
	total := 0
	for _, typ := range POITypes {
		raw, err := os.ReadFile(filepath.Join(dir, typ+".json"))
		if err != nil {
			return err
		}
		var f poiFile
		if err := json.Unmarshal(raw, &f); err != nil {
			return fmt.Errorf("%s.json: %w", typ, err)
		}
		if f.Type != typ {
			return fmt.Errorf("%s.json 의 type %q", typ, f.Type)
		}
		batch.Queue(`DELETE FROM facility WHERE type = $1`, typ)
		seen := map[string]bool{}
		for _, it := range f.Items {
			if it.ID == "" || seen[it.ID] {
				return fmt.Errorf("%s.json: 비었거나 중복된 id %q", typ, it.ID)
			}
			seen[it.ID] = true
			cell, err := h3.LatLngToCell(h3.NewLatLng(it.Lat, it.Lng), H3Res)
			if err != nil {
				return fmt.Errorf("%s %s: %w", typ, it.ID, err)
			}
			detail := it.Detail
			if detail == nil {
				detail = map[string]any{}
			}
			addr, _ := detail["address"].(string)
			batch.Queue(`INSERT INTO facility (type, ext_id, name, address, geom, h3_index, detail, source)
				VALUES ($1, $2, $3, NULLIF($4, ''), ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8, $9)`,
				typ, it.ID, it.Name, addr, it.Lng, it.Lat, cell.String(), detail, f.Source)
		}
		log.Printf("poi: %s %d건 (%s)", typ, len(f.Items), f.Source)
		total += len(f.Items)
	}
	if err := sendInTx(ctx, pool, batch); err != nil {
		return fmt.Errorf("facility 적재: %w", err)
	}
	log.Printf("poi: 합계 %d건", total)
	return runStats(ctx, pool)
}
