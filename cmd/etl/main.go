// etl 은 원천 데이터를 PostGIS 에 적재하는 CLI 다.
//
//	go run ./cmd/etl geocode      주소 → 좌표 (data/processed/*.csv 생성, 기존 좌표는 유지)
//	go run ./cmd/etl grid         제주 경계 → H3 res8 격자
//	go run ./cmd/etl facilities   좌표 CSV → facility
//	go run ./cmd/etl stats        격자별 시설 집계
//	go run ./cmd/etl dummy-risk   임의 위험도
//	go run ./cmd/etl all          geocode(파일 없을 때만) → grid → facilities → stats → dummy-risk
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"jejurisk/internal/db"
)

const (
	H3Res          = 8
	BoundaryPath   = "data/raw/kostat_provinces.json"
	BoundaryKey    = "code"
	BoundaryValue  = "39" // 제주특별자치도
	RawFirePath    = "data/raw/fire_stations_jeju.csv"
	OverridesPath  = "data/raw/geocode_overrides.csv" // 검증된 수동 좌표 (지오코딩보다 우선)
	GeocodedPath   = "data/processed/fire_stations_geocoded.csv"
	FireStationTyp = "fire_station"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "사용법: etl <geocode|grid|facilities|stats|dummy-risk|all>")
		os.Exit(2)
	}
	ctx := context.Background()
	cmd := os.Args[1]

	if cmd == "geocode" {
		must(runGeocode(ctx, true))
		return
	}

	pool, err := db.Connect(ctx)
	must(err)
	defer pool.Close()

	switch cmd {
	case "grid":
		must(runGrid(ctx, pool))
	case "facilities":
		must(runFacilities(ctx, pool))
	case "stats":
		must(runStats(ctx, pool))
	case "dummy-risk":
		must(runDummyRisk(ctx, pool))
	case "all":
		if _, err := os.Stat(GeocodedPath); os.IsNotExist(err) {
			must(runGeocode(ctx, false))
		}
		must(runGrid(ctx, pool))
		must(runFacilities(ctx, pool))
		must(runStats(ctx, pool))
		must(runDummyRisk(ctx, pool))
	default:
		log.Fatalf("알 수 없는 명령: %s", cmd)
	}
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
