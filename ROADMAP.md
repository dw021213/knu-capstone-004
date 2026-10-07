# 제주 위험도 백엔드 — 1차 목표 로드맵

> **이 파일이 작업의 기준점이다.** 세션이 끊기거나 컨텍스트가 압축되면 여기서 이어간다.
> 단계를 끝낼 때마다 체크박스와 "진행 로그"를 갱신할 것.

## 1차 목표 (이번 범위)
119안전센터 24곳 → H3 res8 격자 DB 적재 → **임의(더미) 위험도** → Gin API → 지도에 육각형 + 119 마커 표시.

범위 밖 (나중에): CCTV·편의점·경찰서, 실시간 기상/혼잡도/교통 수집, 실제 모델 연동.

---

## 확정된 결정 사항
| 항목 | 결정 | 이유 |
|---|---|---|
| 언어/웹 | Go 1.27 + Gin | 사용자 지정 |
| DB | PostgreSQL 17 + PostGIS 3.5, 이미지 `imresamu/postgis:17-3.5` | 공식 `postgis/postgis`는 amd64 전용, 이 맥은 arm64 |
| DB 포트 | 호스트 **5433** → 컨테이너 5432 | 로컬 5432 충돌 회피 |
| DB 드라이버 | `jackc/pgx/v5` + 직접 SQL | PostGIS 함수 다수 사용 |
| 스키마 적용 | `migrations/*.sql`을 `docker-entrypoint-initdb.d`에 마운트 | 1차 목표엔 golang-migrate 불필요. 초기화: `docker compose down -v` |
| 격자 | **Uber H3 육각 격자**, 해상도 8 (셀 평균 약 0.74km², 한 변 약 0.46km) | 사각 격자보다 인접 셀 간 거리가 균일 |
| H3 라이브러리 | `uber/h3-go/v4` v4.5.0 (cgo) | `LatLngToCell`, `PolygonToCells` 모두 `(값, error)` 반환 |
| 지오코딩 | **OSM Nominatim** (키 없음), 1 req/s, User-Agent 필수 | 사용자 카카오 키 없음. 결과를 CSV로 저장해 수동 보정 가능하게 |
| 제주 경계 | `data/raw/kostat_provinces.json` (southkorea-maps, 통계청 2013, simple) 중 `code=39` | 이미 다운로드 완료 |
| 지도 | `web/index.html` 단일 파일, Leaflet(unpkg) + OSM 타일, Gin이 정적 서빙 | 같은 origin → CORS 불필요, 빌드 도구 없음 |
| 모듈명 | `jejurisk` | |
| 버전관리 | git, 기본 브랜치 `main`, 레포 로컬 user.email 설정됨 | 나중에 팀 GitHub에 `git remote add origin <url>` 후 push |
| 커밋 단위 | 로드맵 Step 하나 끝날 때마다 커밋 (메시지 예: `feat(etl): H3 격자 생성`) | 진행 상황 추적 |

## 알려진 이슈 / 주의
- **좌표 순서**: h3-go `LatLng{Lat,Lng}` ↔ GeoJSON/PostGIS는 `[lng, lat]`. 폴리곤 만들 때 반드시 뒤집기.
- **경계 폴리곤이 거칠다** (본섬 77개 꼭짓점, 우도 추정 1개 파트, 추자도 없음). 중심점 기준 polyfill이면 해안 셀이 빠짐 →
  `PolygonToCellsExperimental(..., ContainmentOverlapping)` 사용. 바다 셀이 일부 포함되는 건 1차 목표에선 허용.
- **원본 데이터 오류 수정함**: 대정119안전센터 주소 `제주시 대정읍` → `서귀포시 대정읍` (`data/raw/fire_stations_jeju.csv`에 반영).
  연동센터 FAX `046-…`도 오타로 보이나 무관해서 그대로 둠.
- **Nominatim은 제주 도로명주소에 부정확**: "일주서로/일주동로"처럼 섬을 도는 도로는 도로 대표점으로 매칭돼 수 km 틀림
  (중문·대정이 같은 좌표로 나오고, 안덕은 4km 어긋났음). 그래서 `category=highway` 결과는 거부하고,
  **검증된 좌표는 `data/raw/geocode_overrides.csv`에 넣어 우선 적용**한다 (출처 컬럼에 Google Plus Code / OSM 노드 기록).
- **좌표 확인이 필요한 곳 4곳**(overrides의 source가 `APPROX`): 연동, 동홍, 영어교육도시, 한경.
  카카오맵 등에서 확인 후 overrides CSV 수정 → `go run ./cmd/etl geocode && go run ./cmd/etl all`.
- 수동 보정 절차: overrides CSV 편집 → `etl geocode` → `etl all`. (processed CSV를 직접 고쳐도 되지만 overrides가 이력이 남아 권장)

---

## 폴더 구조 (목표)
```
back/
├── ROADMAP.md                     # ← 이 파일
├── CLAUDE.md                      # 세션 시작 시 ROADMAP.md 읽으라는 안내
├── docker-compose.yml
├── .env.example                   # DATABASE_URL=postgres://jeju:jeju@localhost:5433/jeju?sslmode=disable
├── go.mod / go.sum
├── migrations/001_init.sql
├── data/
│   ├── raw/                       # kostat_provinces.json, fire_stations_jeju.csv (원본, 수정 금지 원칙)
│   └── processed/                 # fire_stations_geocoded.csv (lat,lng,source — 수동 보정 허용)
├── cmd/
│   ├── etl/main.go                # 하위 명령: geocode | grid | facilities | stats | dummy-risk | all
│   └── server/main.go             # Gin API + web/ 정적 서빙
├── internal/
│   ├── db/                        # pgx pool (DATABASE_URL)
│   ├── geo/                       # 경계 로드, H3 변환, Nominatim 클라이언트
│   └── api/                       # gin 핸들러
└── web/index.html                 # Leaflet 지도
```

## DB 스키마 (1차)
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE h3_cell (
  h3_index VARCHAR(15) PRIMARY KEY,
  geom     GEOMETRY(Polygon,4326) NOT NULL,
  center   GEOMETRY(Point,4326)   NOT NULL
);
CREATE TABLE facility (
  id       SERIAL PRIMARY KEY,
  type     TEXT NOT NULL,                 -- 'fire_station' (추후 cctv/police/cvs)
  name     TEXT NOT NULL,
  address  TEXT,
  geom     GEOMETRY(Point,4326) NOT NULL,
  h3_index VARCHAR(15),                   -- FK 안 검: 격자 밖(바다/섬) 시설도 허용
  UNIQUE (type, name)
);
CREATE TABLE cell_facility_stat (
  h3_index VARCHAR(15) REFERENCES h3_cell,
  type TEXT, count_in_cell INT, count_k1 INT, nearest_dist_m FLOAT,
  PRIMARY KEY (h3_index, type)
);
CREATE TABLE risk_score (                 -- 시간에 따라 변하므로 격자와 분리
  h3_index VARCHAR(15) REFERENCES h3_cell,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  score FLOAT NOT NULL,                   -- 0~1
  level SMALLINT NOT NULL,                -- 1~5
  source TEXT NOT NULL DEFAULT 'dummy',   -- 'dummy' | 'model'
  PRIMARY KEY (h3_index, ts)
);
CREATE INDEX ON h3_cell  USING GIST (geom);
CREATE INDEX ON facility USING GIST (geom);
```

---

## 단계별 체크리스트

### Step 0. 환경  ✅
- [x] Go 설치 (brew, go1.27.1 darwin/arm64)
- [x] `go mod init jejurisk`, 의존성 추가 (gin, pgx/v5, h3-go/v4, orb)
- [x] Docker Desktop 실행 (Server 29.7.2, aarch64)
- [x] `docker-compose.yml` 작성 → `docker compose up -d` → `psql`/`docker exec`로 `SELECT postgis_version();` 확인
- [x] `CLAUDE.md`, `.env.example`, `.gitignore` 작성
- [x] `git init -b main` + 첫 커밋

### Step 1. 원천 데이터  ✅
- [x] `data/raw/fire_stations_jeju.csv` (24곳, 주소만 있음)
- [x] `data/raw/kostat_provinces.json` (제주 = `code 39`)
- [x] `etl geocode` → `data/processed/fire_stations_geocoded.csv`
  - **검증**: 24곳 모두 lat 33.1~33.6 / lng 126.1~127.0 범위 안, 실패 0건(또는 수동 보정)

### Step 2. 스키마  ✅
- [x] `migrations/001_init.sql` (위 스키마)
- **검증**: `\dt`에 테이블 4개

### Step 3. 격자 (`etl grid`)  ✅
- [x] 경계 GeoJSON → `h3.GeoPolygon` (MultiPolygon 파트별) → `PolygonToCellsExperimental(ContainmentOverlapping, res 8)`
- [x] 셀 경계/중심 → `pgx.CopyFrom` (또는 batch)로 `h3_cell` 적재, 재실행 시 TRUNCATE 후 적재
- **검증**: 셀 수 약 2,500~3,500. 극단값이면 좌표 순서부터 의심

### Step 4. 시설 (`etl facilities`, `etl stats`)  ✅
- [x] geocoded CSV → `facility` UPSERT (type='fire_station'), `h3_index` 채움
- [x] `cell_facility_stat` 계산은 SQL로:
  - `count_in_cell`: GROUP BY h3_index
  - `count_k1`: Go에서 `GridDisk(cell,1)` 또는 SQL `ST_DWithin`으로 근사 (택1, Go 쪽 권장)
  - `nearest_dist_m`: `ORDER BY f.geom <-> c.center LIMIT 1` + `ST_Distance(::geography)`
- **검증**: `facility` 24행, `count_in_cell` 합계 = 24(격자 밖 시설 제외), `nearest_dist_m` 최대값 ≈ 수 km~10여 km (한라산 정상부)

### Step 5. 더미 위험도 (`etl dummy-risk`)  ✅
- [x] **점수 → 등급 방식** (2026-10-07 최종, 119 주행시간 기준은 제거됨):
  - 점수 = 구급출동 기반 `0.25 + 0.75·e` (출동 없으면 0.25 = 2등급, `geo.EMSScore`) → 혼잡도 `× (1 − 0.6·c)` (`geo.AdjustForCongestion`)
  - 등급 = 점수 0.2 간격 (`geo.LevelFromScore`, `internal/geo/ems.go`). 지도 색은 점수 그라데이션(web `COLOR_STOPS`)
  - 119 예상 주행시간(`cell_facility_stat.nearest_drive_min`, 직선×1.3÷40km/h)은 **위험도에 안 쓰고 피처로만 보관**, 셀 팝업에 정보로 표시
  - (이력) 한때 주행시간 구간 보간(0분 0.25 → 30분 1.0)을 기본 점수로 썼으나 사용자 요청으로 제거
- **검증**: 구급출동 많은 도심(제주시 해안, 서귀포, 모슬포)이 붉고 중산간은 연해야 정상

### Step 6. API (`cmd/server`)  ✅
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | DB ping |
| GET | `/api/grid?bbox=minLng,minLat,maxLng,maxLat` | 셀 + 최신 위험도 FeatureCollection (bbox 생략 시 전체) |
| GET | `/api/facilities?type=fire_station` | 시설 점 FeatureCollection |
| GET | `/api/cells/:h3` | 셀 상세 (stat + 최신 risk) |
| GET | `/` | `web/index.html` |
- GeoJSON은 PostGIS `json_build_object` + `ST_AsGeoJSON`로 DB에서 완성 → `ctx.Data(200, "application/geo+json", raw)`
- **검증**: `curl localhost:8080/api/grid | jq '.features | length'` = 셀 수

### Step 7. 지도 (`web/index.html`)  ✅
- [x] Leaflet + OSM 타일, 중심 [33.38, 126.55] zoom 10
- [x] `/api/grid` → level 1~5 색상(초록→빨강), 투명도 0.5
- [x] `/api/facilities` → 마커 + 팝업(센터명, 주소)
- [x] 셀 클릭 → 팝업(h3, score, level, 최근접 119 거리)
- [x] 범례
- **검증**: 브라우저(Claude 내장 브라우저)로 열어 육각형이 제주 위에 있는지, 마커가 셀과 맞는지, 중산간이 붉은지 확인

### 완료 기준 (Definition of Done)
`docker compose up -d && go run ./cmd/etl all && go run ./cmd/server` 후 `http://localhost:8080`에서 위 Step 7 검증 통과.
README 대신 이 파일 하단 "실행 방법"에 명령어 정리.

---

## 실행 방법
```bash
docker compose up -d          # PostGIS (localhost:5433), 최초 기동 시 migrations/ 자동 적용
go run ./cmd/etl all          # 격자 → 시설 → 집계 → 더미 위험도 (geocoded CSV 없으면 지오코딩부터)
go run ./cmd/server           # http://localhost:8080 (지도), /api/*
```
- 더미 위험도만 새로: `go run ./cmd/etl dummy-risk`
- 구급출동 반영: `go run ./cmd/etl ems "<구급출동 CSV 경로>"`
- 혼잡도 테스트: `go run ./cmd/etl congestion-test` (핫스팟 `data/test/congestion_hotspots.csv`), 해제: `go run ./cmd/etl congestion-test clear`
- DB 조회용 뷰 `v_cell_risk`: 셀 + 최신 위험도 + 119 주행시간·거리 + geom (`migrations/003_view_cell_risk.sql`). DBeaver 접속: localhost:5433 / jeju / jeju / jeju
- DB 완전 초기화(스키마 변경 시): `docker compose down -v && docker compose up -d`
- Claude 데스크톱 미리보기: `.claude/launch.json`의 `jeju-risk-server`

### 검증 결과 (2026-10-07)
- H3 res8 셀 **3,483개** (경계 걸침 포함, 우도 포함·추자도 없음), 격자 중심 (126.557, 33.382) = 한라산 부근 → 좌표 순서 정상
- facility 24행, 전부 격자 안, `count_in_cell` 합 24
- 최대 최근접 119 거리 15.5km (중산간)
- 더미 위험 등급 분포(점수 방식 + 테스트 혼잡도): 1=2, 2=709, 3=1071, 4=813, 5=888
- API: `/api/grid` 3483 features, bbox(제주시내) 214, `/api/facilities` 24, 잘못된 셀 404, 잘못된 bbox 400
- 지도: 중산간 붉음 / 119 주변 초록, 셀 클릭 팝업 정상

## 혼잡도 반영 (2026-10-07 추가, 테스트 단계)
- 테이블 `congestion(h3_index, ts, value 0~1, source test|live)` — `migrations/004_congestion.sql` (뷰 `v_cell_risk`에 `congestion` 컬럼 추가)
- 규칙(사람 많으면 위험 ↓): `score × (1 − 0.6·c)` 후 등급을 점수에서 다시 계산. 상수는 `internal/geo/congestion.go`
- 테스트 핫스팟: 한라산국립공원(33.3617,126.5292, σ2000m), 서귀포 시내(33.2497,126.5636, σ1800m), 가우시안 감쇠, 0.05 미만 버림 → 217셀
- `dummy-risk`는 셀별 **최신** 혼잡도를 자동 반영. 실제 수집기가 생기면 `source='live'`로 congestion에 넣기만 하면 됨
- 지도: 혼잡도는 별도 색 없이 위험 등급 하향으로만 표현 (셀 팝업에 혼잡도 수치만 표시)

## 구급출동 반영 (2026-10-07 추가, 테스트 단계)
- 원천: 제주특별자치도소방안전본부 구급출동 현황 2021 CSV (사용자 로컬 `~/Downloads/…/구급출동_2021/구급출동_2021.csv`, 58,234행).
  **환자 정보가 있어 레포·DB에 원본을 넣지 않음.** 사고발생 좌표(`ACDNT_OCRN_LOT/LAT`) → H3 셀·연도별 건수만 `cell_ems_count`에 저장
- 적재: `go run ./cmd/etl ems "<CSV 경로>"` (같은 연도는 덮어씀, 끝나면 dummy-risk 자동 실행). 2015·2020·교통사고 파일도 같은 형식이면 그대로 가능
- 2021 결과: 좌표 없음/제주 밖 307, 격자 밖 573(추자도 등), 출동 있는 셀 2,253개, 최다 셀 1,124건, 99백분위 409건
- 규칙(출동 많으면 위험 ↑): `e = log(1+건수)/log(1+p99)` (0~1), `점수 = 0.25 + 0.75·e`. 상수 `internal/geo/ems.go`
- 계산 순서: 구급출동 점수 → 혼잡도 하향 → 등급
- `migrations/005_ems_dispatch.sql` (뷰 `v_cell_risk`에 `ems_count` 추가), API `ems_count`, 셀 팝업에 연도별 건수
- 결과 등급 분포(주행시간 제거 후): 1=49, 2=1910, 3=966, 4=435, 5=123

## 진행 로그
- 2026-10-07: 로드맵 작성. Go 설치, Docker 실행, go.mod 생성, 경계 GeoJSON 다운로드, 119 CSV 작성(대정 주소 수정).
  Nominatim 1건 테스트 성공(제주 중앙로 342 → 33.4911, 126.5368). **다음: Step 0의 docker-compose부터.**
- 2026-10-07: git 저장소 생성, 첫 커밋. 격자 = Uber H3 육각 격자임을 명시.
- 2026-10-07: Step 0~7 완료 → **1차 목표 달성**. Nominatim 부정확 문제로 overrides CSV 도입(20곳 검증, 4곳 APPROX).
  **다음 후보**: 주행시간을 실제 도로망(OSRM + OSM 제주 도로)으로 교체 / APPROX 4곳 좌표 확정 / 다른 시설(CCTV·편의점·경찰서) 데이터 확보 / 실시간 수집기(기상청 API) 설계 / 프론트 담당과 API 형식 합의.

## 이후 확장 메모 (1차 이후)
- 주행시간 정밀화: OSRM(Docker) + Geofabrik south-korea.osm.pbf(약 200MB)에서 제주만 잘라 셀 중심→최근접 119 실제 주행시간 계산. `geo.DriveMinutes` 호출부만 교체
- 시설 추가: `facility.type`만 바꿔 `etl facilities` 재사용 (CSV 스키마 통일: type,name,address,lat,lng)
- 실시간 수집: `internal/collector/` + `robfig/cron/v3`. 기상청 단기예보는 5km 격자(nx,ny) → `h3_cell`에 nx,ny 매핑 컬럼 추가
- 모델 연동: 모델이 `risk_score`에 `source='model'`로 INSERT만 하면 API/지도는 그대로 동작
- 카카오 키 생기면 지오코더를 카카오로 교체 (`internal/geo`에 인터페이스로 분리해 둘 것)
