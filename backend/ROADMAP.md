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
| 버전관리 | 팀 레포 `github.com/dw021213/knu-capstone-004` 의 `backend/`, 작업 브랜치 **`feat/backend`** (main 은 PR 로만) | 2026-10-11 독립 레포 `종프/back` 에서 이력 포함 이전(subtree). 커밋 이메일은 GitHub noreply |
| Docker 프로젝트 | compose `name: jeju-risk` → 컨테이너 `jeju-risk-db`, 볼륨 `jeju-risk_pgdata` | 폴더 이름과 무관하게 같은 DB 사용 |
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
backend/                           # 팀 레포 knu-capstone-004 의 backend/
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
  - 지도 표시: 줌 ≤ 10(`BLUR_MAX_ZOOM`)이면 위험도 pane 에 CSS 블러 → 연속 그라데이션, 줌 11+ 은 육각형+테두리. 119 마커는 별도 SVG pane(블러 없음, 격자 클릭 안 막음)
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
go run ./cmd/etl road-risk "<교통사고ML_도로전용_…_백엔드전달 폴더>"           # 교통사고(도로) 모델 → combine
go run ./cmd/etl population "<…_250그리드단위_유동인구현황_20151231 폴더>"     # 유동인구 → combine
go run ./cmd/server           # http://localhost:8080 (지도), /api/*
```
- 최종 위험도만 다시 계산: `go run ./cmd/etl combine` (가중치 `internal/risk/risk.go`)
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

## 프론트 연동 (2026-10-11)
- 팀원 프론트는 D3.js. 연동 가이드: `docs/FRONTEND_API.md` (엔드포인트 스키마, D3 최소 예제, 자주 막히는 곳)
- CORS: `gin-contrib/cors`, `CORS_ORIGINS`(쉼표 구분) 없으면 모든 origin 허용(개발용)
- `/api/grid` 폴리곤을 `ST_ForcePolygonCW`로 **시계 방향** 출력 (d3-geo 요구사항. DB 원본은 CCW 그대로)

## 팀 레포 이전 (2026-10-11)
- 작업 위치: `~/Documents/대학교/종프/knu-capstone-004/backend` (브랜치 `feat/backend`). 이전 `종프/back` 폴더는 백업, 더 이상 작업하지 않음
- 커밋 작성자 이메일을 `107867881+MinhwanO@users.noreply.github.com` 으로 변경(공개 레포라 gmail 비공개)
- DB 볼륨 `back_pgdata` → `jeju-risk_pgdata` 로 복사(데이터 유지). `back_pgdata` 는 확인 후 삭제 가능

## (폐기) 날짜별 교통사고 모델 (2026-10-11 → 2026-10-12 삭제)
- `backend_catboost_13_v3` 2011~2021 날짜별 점수(1,467만 행)를 `model_risk_daily` 로 적재·`/api/model-risk?date=` 로 제공했으나,
  현재 시점 서비스 목표와 맞지 않아 도로 전용 모델로 **교체·삭제**(테이블 DROP, API·지도 날짜 선택 제거). 코드는 git 이력(커밋 8e5007a~d621b7c)에 있음
- 이때 통일한 **3,651셀 격자**(`data/raw/h3_cells_model_v3.csv`, 추자도 포함)는 ML 팀 공통 격자라 그대로 사용

## 종합 위험도 combined_v1 (2026-10-12)
**최종 = 0.8 × 위해도 + 0.2 × 고립도** (`internal/risk/risk.go`)
- 위해도 = 가용 위험 모델 백분위/100 평균. 계획: 교통사고·재난·범죄 동일 가중. **현재 교통사고만**
- 고립도 = 1 − 유동인구 백분위 순위(전체 3,651셀 기준, 인구 없는 셀 = 0명). 세 위험 공통 "도움받기 어려운 정도"로 보고 최종 단계에서 한 번만 반영
- 위해도가 없는 셀(도로 자료 없는 1,451셀, 우도·추자도 포함)은 최종 위험도 null → 지도 회색 "도로 자료 없음"(안전 아님)
- 등급 = 최종 점수의 셀 간 백분위, 경계 90/70/30/10
- **가중치 0.2 기준**: 고립도를 넣어도 위해도만의 상위 10% 셀 중 70% 이상이 남는 가장 큰 값.
  교통사고만일 때 분석(도로 2,200셀): 0.2→70%, 0.3→35%, 0.5→결과 뒤집힘. 재난·범죄 추가 시 같은 기준으로 재확인(허용 0.15~0.25)
  - 도로 모델 백분위는 유동인구와 양의 상관(log 기준 0.55): 붐비는 20% 평균 77, 한산한 20% 평균 32 → 고립도가 반대 방향이라 큰 가중치는 도로 결과를 덮음
- 실제 결과(combined_v1): 도로 모델과 순위 상관 0.98, 상위 10% 유지 79%, 한산한 셀 평균 32→39, 붐비는 셀 77→72. 등급 1=220, 2=440, 3=880, 4=440, 5=220
- 자료
  - 교통사고: `~/Documents/대학교/종프/교통사고ML_도로전용_20260914_백엔드전달` (`jeju_h3_r8_road_catboost_20260914_v1`, 도로자료 2026-09-14, 날짜 무관 고정 점수, 도로 있는 2,200셀만 백분위)
    → `etl road-risk`: artifact_manifest SHA-256, 3,651행, 고유 h3, 격자 일치, 도로 셀 2,200, has_road↔백분위 null 일치 검증
  - 유동인구: `~/Documents/대학교/종프/제주특별자치도_성연령별_제주도민_250그리드단위_유동인구현황_20151231` (2015-12 월 전체, 12개 성연령 합)
    → `etl population`: 250m 격자 중심(EPSG:5179) → 위경도 → H3 합산, 17,225개 전부 매칭, 인구 있는 셀 3,058개
    → **2015 도민 분포를 현재로 가정**(순위만 쓰므로 총량 변화 무관). 관광객 미포함·신규 개발지 과소 → API/범례에 가정 명시
    → 평일/휴일 파일은 월 전체와 상관 0.998 이라 미사용. 시간대·날씨별 유동인구(`…_시간대별_…_20150131`)로 바꾸면 시간·날씨에 따라 변하는 위험도로 확장 가능
- 테이블: `hazard_meta`, `hazard_score(h3,hazard)`, `cell_population`, `risk_combined` (`migrations/006_hazard_risk.sql`), 뷰 `v_cell_risk` 갱신
- API: `/api/risk/meta`, `/api/grid`(risk_*·hazard·isolation·traffic_percentile·has_road·population, 더미는 dummy_*), `/api/cells/:h3`(risk·hazards·population). 날짜 파라미터 없음
- 지도: "종합 위험도"(기본) / "더미 (테스트)" 모드, 도로 자료 없음 회색, 팝업에 구성(위해도×0.8 + 고립도×0.2)
- **유동인구 켜기/끄기** (2026-10-12): `risk_combined.hazard_percentile·hazard_level`(위해도만의 순위·등급, `migrations/007_hazard_only_rank.sql`)을 함께 저장.
  API 는 두 버전을 다 내려주고(`risk_*` = 켬, `hazard_*` = 끔) 지도는 "유동인구(고립도) 반영" 체크박스로 전환. 끄면 1,843셀 색 변화, 450셀 등급 변화
- **시간대별 유동인구** (2026-10-12): 월 단위(2015-12 성연령별) → `~/Downloads/제주특별자치도_시간대별_제주도민_250그리드단위_유동인구현황_20150131`
  (2015-01, 조건 8종 전체·평일·휴일·휴일전날·맑음·흐림·비·눈 × 0~23시). `etl population <폴더>` → `cell_population_hourly`(53.9만 행),
  `etl combine` → `risk_combined (h3, condition, hour)` 70만 행(12초). 고립도 순위는 슬롯별, 위해도는 고정. `migrations/008_hourly_population.sql`
  - API: `/api/grid?condition=&hour=`, `/api/cells/:h3?condition=&hour=`(+ `hourly` 24개), `/api/risk/meta`(conditions·default_slot). 생략 시 현재 한국 시각(토·일 휴일, 금 휴일전날, 그 외 평일)
  - 지도: 조건 선택 + "지금" + 시간 슬라이더, 팝업에 0~23시 순위 막대
  - **관찰: 시간대 효과가 작음** — 정오 대비 등급 변경 셀 3시 148 / 0시 112 / 21시 72 / 15시 16 (전체 2,200 중), 조건별(12시) 눈 48·휴일 18·비 8.
    고립도를 **슬롯마다 상대 순위**로 매기므로 "밤엔 어디나 한산"한 절대 변화가 사라지고, 붐비는 곳 순서는 시간대가 바뀌어도 거의 같기 때문
    → **해결 (2026-10-13, combined_v2): 공통 기준** — 고립도·최종 순위를 모든 조건 × 0~23시 × 셀(70만 개)을 한 줄로 세워 매김
  - **유동인구 파일 값은 하루 평균이 아니라 조건별 월 합계** (평일 100,888 + 휴일 51,847 + 휴일전날 25,176 = 전체 177,911, 12시 기준).
    그대로 공통 기준에 넣으면 날 수가 적은 눈·휴일전날이 '한산'해 보이는 착시 → 하루 평균으로 환산(`migrations/009`, `population_source.days`)
    - 요일 조건: 2015-01 달력 일수 전체 31·평일 16·휴일 10(주말 9 + 1/1)·휴일전날 5(금)
    - 날씨 조건: 일수 자료 없음(넷 합 > 전체 = 날짜 중복) → 섬 전체 하루 인구를 '전체'와 같게 맞춤(환산 일수 맑음 19.6·흐림 11.1·비 15.7·눈 1.9). 날씨별 총량 변화는 미반영
  - 결과(전체 조건, 정오 대비): 등급 변경 셀 0시 577·3시 718·6시 480·21시 280·9~18시 17~63. 5등급 셀 12시 158 → 3시 333
  - 조건별(14시) 평균 순위 47.0~47.6 로 차이 작음(정상화 후). 가중치 기준(슬롯 안 위해도 상위 10% 유지) 75~88% 로 0.2 유지
- 재난·범죄 모델 추가 방법: `hazard_meta`/`hazard_score` 에 hazard='disaster'|'crime' 로 적재하는 ETL 추가 → `etl combine`. API·지도는 수정 없이 반영(`hazards.*`)

## 기상 가산 (2026-10-13)
- 목적: 관측값이 우리 기준(기상청 특보 기준 참고)을 넘으면 위험도에 가중치를 더함. 모델 입력이 아니라 사후 가산. 실시간 + 과거 실험 같은 코드
- 기준·가중치: `config/weather_rules.json` (요청마다 읽음 → 서버 재시작 없이 실험). **2일 연속 등 지속 조건 제거**, 그 시각 관측으로 판별
  - 호우 3h 60/90mm·12h 110/180mm(+0.10/+0.20), 강풍 10분평균 14/21m/s·산지 17/24(+0.05/+0.10), 대설 24h 신적설 5/20cm·산지 20/30(+0.10/+0.20),
    폭염 체감온도 33/35℃(+0.05/+0.10), 한파 기온 −12/−15℃(+0.05/+0.10), 건조 습도 35/25%(+0.03/+0.05). 합계 상한 0.3
  - **(2026-10-14 v2, 영향도 비례로 교체)** 호우 0/0.15, 강풍 0/0.10, 대설 0.10/0.20, 폭염 0/0.07, 한파 0.11/0.11, 건조 0.03/0.03 — 근거는 `config/weather_rules.json` evidence
  - 체감온도: 기상청 여름철 식(Stull 습구온도). 순간풍속은 정시자료에 없어 미사용
- 최종 = min(1, 기존 점수 + 가산), 등급은 가산 전 점수 분위수(`risk_score_quantiles`, etl combine 이 갱신)에 대어 `risk_pct()`·`risk_level()`(SQL 함수)로 다시 매김
- 자료: **기상청 API허브** (`KMA_APIHUB_KEY` in `.env`, authKey 값만). 정시자료 `awsh.php`(TA·WS·RN_HR1·HM 등, 결측 −99), 지점정보 `stn_inf.php?inf=AWS`
  - 제주 AWS 43곳(산지 8: 윗세오름·한라산남벽·삼각봉·진달래밭·영실 등, 지점정보 주소의 "(산지)"), 셀→최근접 지점 평균 3.3km
  - API허브가 가끔 504 → 재시도. 1시간 1호출(전국)이라 하루 약 76초, 1년 약 8시간 → **과거 1년은 기상자료개방포털 CSV 권장**
- 명령: `etl weather-stations`, `etl weather-fetch [-from -to]`, `etl weather-import <CSV 폴더>`(머리글 이름 기반: 지점·일시·기온·풍속·강수량·습도·적설),
  `etl weather-test <heavy_rain|strong_wind|heat|cold|dry|clear> [-stn mountain|all|번호]`, `etl weather-eval -from -to [-out csv]`
- 서버: `KMA_APIHUB_KEY` 있으면 15분마다 최근 3시간 수집(`WEATHER_POLL=off` 로 끔). `.env` 자동 로드(`internal/envfile`)
- API: `?at=YYYY-MM-DDTHH:MM`(KST, 기본 지금, 유동인구 슬롯도 at 기준), `?weather=off`. 응답 `base_*`·`weather_bonus`·`weather_alerts`·`weather`(셀 지점·지표)
- 지도: 날짜·"지금"·시간 슬라이더, "기상 가산" 체크, 팝업에 기준 초과·지점 관측, 범례에 관측/초과 지점 수
- 검증: 산지 강풍 테스트 → 산지 기준 주의보급, 88셀 가산·24셀 등급 상승 / 2021-08-23(태풍 오마이스) API허브 수집 → 진달래밭 19~20시 호우 주의보급(3h 67mm)
- **2021년 과거 실험** (2026-10-13): 기상자료개방포털 파일셋 `~/Downloads/2021기상정보/SURFACE_AWS_*_HR_2021_2021_2022.zip` 36개
  (머리글 지점·일시·기온·풍향·풍속·강수량·기압·습도·일사·일조, 지점당 8,760행) → 압축 풀어 `etl weather-import` → 33곳 288,438행(3곳은 현재 지점 목록에 없어 제외)
  - `weather-eval` 1년(11초): 호우 386시간(주로 산지), 강풍 626시간(마라도·가파도·우도 등 섬), 폭염 125시간(해안 저지대), 한파 176시간(산지만)
  - 원칙: **모든 지점 같은 기준**(사용자 결정). 한파·강풍은 그대로. 단 **건조는 순간 습도 → 최근 24시간 평균 습도(`humidity_24h`, 실효습도 근사)**로 변경
    (모든 지점 동일 적용, 기상청 실효습도 기준에 더 가까움). 건조 시간 32% → 20%, 지점·시간 12,643 → 6,328(저지대 −79%, 산지 −42%. 산지는 실제로 건조)
  - `weather-fetch` 는 동시 요청(-workers)·이어 받기로 바꿈(컴파일만 확인, 대량 실행은 아직)
- **가중치 근거 분석** (2026-10-13, `analysis/weather_rate_ratio.py`): 2021 교통사고 구급출동 4,259건(시각 없음 → **일 단위**),
  사고 좌표 → 2021 관측 있는 가장 가까운 AWS 지점. 지점·일마다 그날 기준 초과(최고 단계) 여부로 나눠 사고 배율, 지점×월 층화 Mantel-Haenszel
  | 항목 | 주의보급 이상 | 경보급 |
  |---|---|---|
  | 호우 | 0.93 (0.66~1.33) | **2.55 (1.51~4.28)** ↑ 유의 |
  | 강풍 | **0.46 (0.23~0.91)** ↓ 유의 (바람 센 날 이동 감소 추정) | – |
  | 폭염 | 1.17 (0.82~1.67) | 1.94 (0.46~8.09, 2일) |
  | 한파 | 3.64 (0.96~13.8, 사고 3건) | 0건 |
  | 건조 | 1.06 (0.80~1.41) | 0.91 (0.46~1.79) |
  - 한계: 1년·일 단위, 출동 건수는 이동량(노출)에 영향받음, 교통사고만(재난·범죄 근거 아님), 여러 항목 동시 검정
  - 처음엔 셀 연결 지점(ASOS 184 등 2021 관측 없음) 그대로 써서 2,362건만 분석됨 → 관측 있는 최근접 지점으로 재연결해 4,259건 전부 사용
- **다음**: 위 결과로 가중치 조정 여부 결정 / 대설용 적설(ASOS 파일셋) / 다른 연도로 재확인

## 진행 로그
- 2026-10-07: 로드맵 작성. Go 설치, Docker 실행, go.mod 생성, 경계 GeoJSON 다운로드, 119 CSV 작성(대정 주소 수정).
  Nominatim 1건 테스트 성공(제주 중앙로 342 → 33.4911, 126.5368). **다음: Step 0의 docker-compose부터.**
- 2026-10-07: git 저장소 생성, 첫 커밋. 격자 = Uber H3 육각 격자임을 명시.
- 2026-10-07: Step 0~7 완료 → **1차 목표 달성**. Nominatim 부정확 문제로 overrides CSV 도입(20곳 검증, 4곳 APPROX).
  **다음 후보**: 주행시간을 실제 도로망(OSRM + OSM 제주 도로)으로 교체 / APPROX 4곳 좌표 확정 / 다른 시설(CCTV·편의점·경찰서) 데이터 확보 / 실시간 수집기(기상청 API) 설계 / 프론트 담당과 API 형식 합의.

- 2026-10-12: 날짜별 모델 삭제, 도로 전용 교통사고 모델 + 2015 유동인구 고립도로 종합 위험도 combined_v1 (0.8:0.2). 프론트 문서 갱신.
  **다음 후보**: 재난·범죄 모델 수신 시 hazard 추가 / 시간대·날씨별 유동인구로 고립도 동적화 / 기상청 실시간 연동

- 2026-10-13: 시간대별 유동인구 공통 기준(combined_v2), 기상 가산(API허브 실시간 + 2021 과거), 건조 24h 평균 습도, 사고 배율 분석, 주소로 시각 지정.

- 2026-10-13: 교통사고 모델을 **우도·추자도 포함 도로 모델**(`jeju_h3_r8_road_islands_its20260914_ngii2025_v1`)로 교체.
  도로 셀 2,200 → 2,249(섬 수치지도 49셀, 도로 형상 3개 변수만). 셀별 출처는 `hazard_score.detail`(migration 011) → `/api/cells` `hazards.traffic.detail`.
  `etl road-risk`는 옛/새 metadata 키 둘 다 읽음. 고립도 0.2 재확인: 위해도 상위 10% 유지율 0.15→85%, 0.2→79%, 0.25→69%, 0.3→53% → 0.2 유지.
- 2026-10-13: 팀 공유용 `README.md`, `scripts/db-dump.sh`·`db-restore.sh` 추가. 덤프 `종프/jeju_20261013_road-islands.sql.gz`(21MB),
  빈 새 DB 컨테이너에 복원해 행 수 일치 확인. 덤프는 레포 금지(.gitignore), 드라이브로 전달.
- 2026-10-14: 보정 곡선 (`analysis/calibration.py`, 2021 교통사고 구급출동 4,208건, 셀-일 단위 — 원본에 신고 시각 없음).
  기본점수 +0.1 → 사고율 ×1.81. 고립도는 사고 빈도와 반대(모든 위해도 층에서), 구급차 현장거리와는 같은 방향(평균 2.6→11.7km).
  기상 점수 환산: 호우 경보급 +0.15(0.06~0.23, 현재 0.20), 강풍 주의보급 −0.19(유의), 나머지 CI가 0 포함. 가중치는 아직 안 바꿈.
- 2026-10-14: 기상 가산을 영향도 비례(weather_rules_v2)로 교체 — 사고 배율을 점수로 환산(ln RR / 5.916), 음수 0, 경보급 ≥ 주의보급, 추정 불가 v1 유지.
  고립도는 '한산할수록 위험' 유지(0.2). 범죄·재난 모델이 오면 모델별 발생 자료로 고립도 영향도를 재서 모델별 가중치로 바꿀 계획.
- 2026-10-14: 2020 AWS(API허브 8,784시간) 수집, 2020+2021 보정 재분석(사고 8,461건). 호우 경보급 2021 ×2.37 → 2020 ×0.55(태풍 마이삭·하이선 날 이동 감소) → 합산 ×1.01.
  합산에서 유의한 것: 강풍 주의보급 ×0.76(−), 폭염 주의보급 ×1.21(+0.03). 고립도는 두 해 모두 빈도와 반대, 현장거리와 같은 방향(2.5→9.4km).
  구급출동 2020 교통사고 파일은 실제로 2011~2020 10년 치(모델 학습 2017~2019 주의). weather_rules 는 아직 v2(2021 기준) 유지.
- 2026-10-15: **유동인구 기본 끔**(지도 체크 해제, ?population=on 으로 켬, meta default_population=false, 프론트는 hazard_* 로 칠함).
  기상 규칙 v3: **호우 경보급 +0.18만** 가산(위해도 점수 기준 RR 2.44 → ln/4.835 = 0.185), 나머지 0(기준 초과는 표시만).
- 2026-10-17: 기상 규칙 v4 — 호우 경보급 가산을 **단순 비교**로 다시 산정: 사고율 10.77 ÷ 5.12 = ×2.11 (1.31~3.40) → ln/4.835 = 0.154 → **+0.15**.
  (셀 위험도·월 보정 시 ×2.44 → +0.18 이었으나 설명을 단순하게 하기로 결정)
- 2026-10-17: main(프론트·시설 POI) 병합. 배포 준비: `Dockerfile`(server+etl, cgo), `deploy/`(docker-compose.prod.yml: db+server+caddy, Caddyfile, .env.example, DEPLOY.md).
  로컬에서 운영 구성 전체(HTTPS 포함) 기동·덤프 복원·API 확인. 호스팅은 Vultr 서울 2GB 로 결정, 주소는 DuckDNS 무료 서브도메인.
- 2026-10-17: 시설 POI 5종(CCTV 1,291·편의점 1,300·숙박 1,153·경찰 25·응급실 6)을 프론트 POI 파일에서 facility 로 적재(`etl poi`, migration 012: ext_id·detail·source, (type, ext_id) 고유) → 셀별 통계 6종.
  `/api/grid` 에 base_hazard_percentile·base_hazard_level·road_source·facility_counts 추가, `/api/facilities` 에 detail·source·ext_id.
  서버 기동 시 최근 24시간 기상 백필. `db-dump.sh --deploy`(weather_obs 내용 제외, 19MB). 운영은 실시간 기상만 쓰기로.
- 2026-10-17: **유동인구 완전 제외 (`traffic_weather_v1`)**. 최종 = min(1, 모델 위험점수(hazard_score 백분위 평균/100) + 기상 가산).
  API: risk_* = 가산 반영, base_* = 가산 전 (짝), hazard_* 는 risk_* 와 같은 값으로 호환용 유지. isolation·population·hourly·condition·hour 삭제.
  risk_combined·유동인구 표는 DB 에 남아 있지만 API 가 안 씀(배포 덤프에서 내용 제외). 확인용 지도에서 유동인구 UI 삭제. frontend/ 는 건드리지 않음.
- 2026-10-17: 교통사고 모델을 **깊이 8**(`jeju_h3_r8_road_d8_its20260914_ngii2025_v2`, 2020 검증 상위 20% 포착률로 선택)로 교체. 형식·격자·도로 입력 동일.
  모델 점수 0.1당 사고율 ×1.63(깊이 6 ×1.62), 호우 경보급 가산 ln 2.10/4.893 = 0.152 → 0.15 유지.
- 2026-10-17: **운영 배포 완료** — https://jeju-risk.duckdns.org (Vultr 서울 vc2-1c-2gb $10/월, Ubuntu 24.04, 158.247.200.215).
  docker compose(deploy/docker-compose.prod.yml) db+server+caddy, Let's Encrypt 인증서, ufw 22/80/443, SSH 키 전용(비밀번호 로그인 차단).
  배포 덤프 road-d8-deploy 복원, 기동 시 24시간 기상 백필(1,032행) 확인. 서버 코드 위치 /root/knu-capstone-004 (feat/backend).
  Vultr 무료 크레딧 $250 은 2026-11-17 만료 → 이후 카드 과금. 안 쓰면 Destroy. CORS_ORIGINS 는 아직 비어 있음(모두 허용).
- 2026-10-18: 자동 배포(GitHub Actions `backend-deploy`) — **main 머지 시에만** 배포하도록 변경 (서버 스크립트도 origin/main 기준).
  배포 전용 키는 서버에서 deploy-backend.sh 만 실행 가능. 시크릿 DEPLOY_SSH_KEY 등록됨. 지금 서버는 feat/backend 7bdd7f6 상태 → feat/backend→main PR 머지 후 main 기준으로 맞춰짐.

## ▶ 현재 상태 요약 (2026-10-19, 이어서 작업할 때 여기부터)

- **작업 위치**: `~/Documents/대학교/종프/knu-capstone-004/backend`, 브랜치 `feat/backend` (main 직접 push 금지, frontend/ 는 팀원 담당이라 건드리지 않음)
- **위험도 `traffic_weather_v1`**: 최종 = min(1, 모델 위험점수 + 기상 가산). 유동인구(고립도)는 완전 제외(2021 사고에서 반대 방향)
  - API: `risk_*` = 가산 반영(색), `base_*` = 가산 전, `hazard_*` = risk_* 와 같은 값(프론트 호환용, 나중에 삭제)
  - 모델: 깊이 8 `jeju_h3_r8_road_d8_its20260914_ngii2025_v2` (원천 `종프/교통사고ML_2026도로_깊이8_백엔드전달_20261017`)
  - 기상 규칙 v4: **호우 경보급만 +0.15** (2021 단순 비교 ×2.11, 모델 0.1점당 ×1.63 → 0.152). 나머지는 판별·API 제공만(가산 0)
- **시설 POI**: fire_station 24, cctv 1,291, convenience 1,300, lodging 1,153, police 25, er 6 (`etl poi ../frontend/public/data/poi`)
- **운영**: https://jeju-risk.duckdns.org — Vultr 서울 vc2-1c-2gb($10/월) 158.247.200.215, root SSH 키(로컬 `~/.ssh/id_ed25519`, passphrase 있음, 키체인)
  - 서버 코드 `/root/knu-capstone-004`, `backend/deploy/docker-compose.prod.yml`(db+server+caddy), `.env` 서버에만
  - 자동 배포: `.github/workflows/backend-deploy.yml` — **main 에 backend/ 머지 시에만**, 서버 `/root/deploy-backend.sh`(origin/main), 시크릿 DEPLOY_SSH_KEY(로컬 `~/.ssh/jeju_deploy_actions`, 서버에서 스크립트만 실행 가능)
  - ⚠️ 서버는 지금 feat/backend `7bdd7f6` 상태. **feat/backend→main PR 머지 전에 Run workflow 누르면 옛 main 백엔드로 되돌아감**
  - 데이터 변경 시: `scripts/db-dump.sh --deploy` → scp → DEPLOY.md 6번. Vultr 크레딧 $250 은 **2026-11-17 만료**
- **문서**: 프론트용 `docs/FRONTEND_API.md`(맨 위 2026-10-17 변경 박스), 배포 `deploy/DEPLOY.md`, 분석 `analysis/calibration.py`
- **남은 일**: PR(feat/backend→main) 머지 확인 / 프론트 api 모드 연결(VITE_DATA_MODE=api, VITE_API_BASE) / CORS_ORIGINS 를 팀 Vercel 주소로 제한 / 기상청 키 재발급 / ASOS 로 사고 시각 복원 후 시간 단위 재검증 / 프론트에 weather_alerts 표시 요청 / 백엔드 단위 테스트
- **발표**: 백엔드 슬라이드 24~28쪽(사용자가 직접 정리). 대본은 2021년 자료만 사용한 것으로 통일, 가산 안 하는 기상 항목은 "API 로 제공(화면 표시는 프론트 연동 때)"로 표현

## 이후 확장 메모 (1차 이후)
- 주행시간 정밀화: OSRM(Docker) + Geofabrik south-korea.osm.pbf(약 200MB)에서 제주만 잘라 셀 중심→최근접 119 실제 주행시간 계산. `geo.DriveMinutes` 호출부만 교체
- 시설 추가: `facility.type`만 바꿔 `etl facilities` 재사용 (CSV 스키마 통일: type,name,address,lat,lng)
- 실시간 수집: `internal/collector/` + `robfig/cron/v3`. 기상청 단기예보는 5km 격자(nx,ny) → `h3_cell`에 nx,ny 매핑 컬럼 추가
- 모델 연동: 모델이 `risk_score`에 `source='model'`로 INSERT만 하면 API/지도는 그대로 동작
- 카카오 키 생기면 지오코더를 카카오로 교체 (`internal/geo`에 인터페이스로 분리해 둘 것)
