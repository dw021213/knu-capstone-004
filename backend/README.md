# 제주 위험도 백엔드

Go(Gin) + PostGIS + Uber H3(res 8, 3,651셀). 셀별 위험도를 계산해 API와 지도(`web/index.html`)로 제공한다.

- 위험도 = 교통사고 도로 모델 위험점수 + 기상 가산(호우 경보급일 때 +0.15). 유동인구는 2026-10-17 제외
- 프론트 연동 API: [`docs/FRONTEND_API.md`](docs/FRONTEND_API.md)
- 결정 사항·진행 기록: [`ROADMAP.md`](ROADMAP.md)

## 실행 (DB 덤프를 받은 경우)

데이터(모델 점수, 유동인구, 2021 기상 등)는 레포에 없고 **DB 덤프 파일**(`jeju_YYYYMMDD_….sql.gz`, 약 20MB)로 따로 전달한다.

### 1. 준비물
- Docker (Docker Desktop)
- Go 1.21 이상 (go.mod 의 1.27 툴체인은 첫 실행 때 자동으로 받는다)
- C 컴파일러: H3 라이브러리가 cgo를 쓴다. macOS `xcode-select --install`, Ubuntu `sudo apt install build-essential`, Windows는 WSL2 권장

### 2. 코드 받기와 설정
```bash
git clone -b feat/backend https://github.com/dw021213/knu-capstone-004.git
cd knu-capstone-004/backend
cp .env.example .env
```
`KMA_APIHUB_KEY`(기상청 API허브 키)는 **실시간 기상 수집에만** 필요하다. 비워 두면 수집이 꺼지고, 과거 시각(`?at=2021-09-17T06:00`)과 저장된 관측으로는 그대로 동작한다.

### 3. DB 띄우고 덤프 넣기
```bash
docker compose up -d
scripts/db-restore.sh ~/Downloads/jeju_20261013_road-islands.sql.gz
```
DB는 `localhost:5433`(user/password/db 모두 `jeju`)이다. DBeaver 등으로 볼 수 있다. 덤프를 넣으면 기존 데이터는 덤프 내용으로 바뀐다.

### 4. 서버
```bash
go run ./cmd/server
```
- 지도: http://localhost:8080
- API 예: http://localhost:8080/api/risk/meta

## 덤프 만들기 (데이터를 가진 쪽)
```bash
scripts/db-dump.sh
```
레포 밖(`../../`)에 `jeju_날짜_모델.sql.gz`를 만든다. 덤프에는 구급출동 원본과 API 키가 없다(셀별 건수만 있음). **레포에 커밋하지 말 것.**

## 원본에서 다시 만들기 (ETL)
원천 파일이 있으면 `go run ./cmd/etl <명령>`으로 처음부터 적재할 수 있다. 순서와 원천 위치는 `ROADMAP.md`의 "현재 상태 요약"을 본다.

| 명령 | 내용 |
|---|---|
| `grid`, `facilities`, `stats` | 격자 3,651셀, 119 위치, 셀별 시설 통계 |
| `road-risk <모델 폴더>` | 교통사고 도로 모델 점수 적재(해시 검증) → 위험도 재계산 |
| `population <시간대별 유동인구 폴더>` | 8개 조건 × 24시간 유동인구 → 위험도 재계산 |
| `weather-stations` / `weather-import <폴더>` / `weather-fetch` | 기상 지점, 과거 CSV 적재, API허브 수집 |
| `poi <frontend/public/data/poi>` | CCTV·편의점·숙박·경찰서·응급실을 프론트와 같은 파일로 적재 → 셀별 시설 통계 |
| `weather-test <heavy_rain …>` | 시연용 가짜 관측 |
| `weather-eval -from -to` | 기간 동안 기준 초과 판별 |

## 주의
- 좌표 순서: h3-go는 (lat, lng), GeoJSON·PostGIS는 (lng, lat)
- 스키마(migrations)는 DB 볼륨이 비어 있을 때 한 번만 자동 실행된다. 처음부터 다시 하려면 `docker compose down -v`
- 위험도는 셀 간 상대 순위다. 사고 확률이 아니다.
