// etl 은 원천 데이터를 PostGIS 에 적재하는 CLI 다.
//
//	go run ./cmd/etl geocode      주소 → 좌표 (data/processed/*.csv 생성, 기존 좌표는 유지)
//	go run ./cmd/etl grid         H3 res8 격자 (모델과 같은 3,651개 셀 목록 → 도형 계산)
//	go run ./cmd/etl facilities   좌표 CSV → facility
//	go run ./cmd/etl stats        격자별 시설 집계
//	go run ./cmd/etl dummy-risk   임의 위험도 (최신 혼잡도가 있으면 반영)
//	go run ./cmd/etl congestion-test [clear]  테스트 혼잡도 생성(또는 삭제) 후 위험도 재계산
//	go run ./cmd/etl ems <구급출동 CSV>      셀별 구급출동 건수 적재 후 위험도 재계산
//	go run ./cmd/etl road-risk <도로전용 ML 폴더>  도로 전용 교통사고 모델 점수 적재(검증) → combine
//	go run ./cmd/etl population <유동인구 폴더>   250m 유동인구 → 셀별 합계 → combine
//	go run ./cmd/etl combine                     최종 위험도 = 0.8×위해도 + 0.2×고립도 (internal/risk)
//	go run ./cmd/etl weather-stations            제주 AWS 지점 + 셀↔지점 연결 (API허브)
//	go run ./cmd/etl weather-fetch [-from -to]    API허브 정시자료 수집 (기본: 최근 3시간)
//	go run ./cmd/etl weather-import <CSV 폴더>    기상자료개방포털 시간자료 CSV 적재
//	go run ./cmd/etl weather-test <시나리오|clear> 테스트 관측 넣기/지우기
//	go run ./cmd/etl weather-eval -from -to       기간별 기준 초과 요약 (과거 실험)
//	go run ./cmd/etl all          geocode(파일 없을 때만) → grid → facilities → stats → dummy-risk
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"jejurisk/internal/db"
	"jejurisk/internal/envfile"
)

const (
	H3Res          = 8
	GridCellsPath  = "data/raw/h3_cells_model_v3.csv" // ML 팀 공통 3,651개 셀 (도로 전용 모델도 같은 격자)
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
		fmt.Fprintln(os.Stderr, "사용법: etl <geocode|grid|facilities|stats|dummy-risk|congestion-test [clear]|ems <csv>|road-risk <dir>|population <dir>|combine|weather-*|all>")
		os.Exit(2)
	}
	envfile.Load(".env")
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
	case "poi":
		if len(os.Args) < 3 {
			log.Fatal("사용법: etl poi <frontend/public/data/poi 폴더>")
		}
		must(runPOI(ctx, pool, os.Args[2]))
	case "dummy-risk":
		must(runDummyRisk(ctx, pool))
	case "ems":
		if len(os.Args) < 3 {
			log.Fatal("사용법: etl ems <구급출동 CSV 경로>")
		}
		must(runEMS(ctx, pool, os.Args[2]))
	case "road-risk":
		if len(os.Args) < 3 {
			log.Fatal("사용법: etl road-risk <교통사고ML_도로전용_…_백엔드전달 폴더>")
		}
		must(runRoadRisk(ctx, pool, os.Args[2]))
	case "population":
		if len(os.Args) < 3 {
			log.Fatal("사용법: etl population <…_250그리드단위_유동인구현황_… 폴더>")
		}
		must(runPopulation(ctx, pool, os.Args[2]))
	case "combine":
		must(runCombine(ctx, pool))
	case "weather-stations":
		must(runWeatherStations(ctx, pool))
	case "weather-fetch":
		must(runWeatherFetch(ctx, pool, os.Args[2:]))
	case "weather-import":
		if len(os.Args) < 3 {
			log.Fatal("사용법: etl weather-import <기상자료개방포털 CSV 폴더 또는 파일>")
		}
		must(runWeatherImport(ctx, pool, os.Args[2]))
	case "weather-test":
		must(runWeatherTest(ctx, pool, os.Args[2:]))
	case "weather-eval":
		must(runWeatherEval(ctx, pool, os.Args[2:]))
	case "congestion-test":
		must(runCongestionTest(ctx, pool, len(os.Args) > 2 && os.Args[2] == "clear"))
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
