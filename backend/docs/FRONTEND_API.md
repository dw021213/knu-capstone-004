# 프론트 연동 API 가이드

제주 위험도 지도 프론트(D3.js)가 백엔드에서 데이터를 받아 오는 방법을 정리한 문서다.
좌표·격자·위험도는 모두 백엔드 DB 에 있으니 프론트는 **아래 API 를 호출해서 받은 데이터를 그리기만** 하면 된다.

- 기본 주소: `http://localhost:8080`
  - 다른 PC 에서 붙을 때: `http://{백엔드 PC IP}:8080` (같은 와이파이)
- 모든 요청은 `GET`, 응답은 JSON / GeoJSON(UTF-8)
- CORS 허용됨 (다른 포트·주소의 프론트에서 바로 호출 가능)
- 좌표는 GeoJSON 표준 **[경도, 위도]**
- 위험도 데이터: **교통사고 ML 모델**(`backend_catboost_13_v3`)이 미리 계산한 **2011-01-01 ~ 2021-12-31 날짜별 점수**

---

## 한눈에 보기

| # | 호출 | 언제 | 필수 |
|---|---|---|---|
| ① | `GET /api/model-risk/meta` | 페이지 처음 열 때 | ✅ |
| ② | `GET /api/grid?date={날짜}` | 처음 지도 그릴 때 | ✅ |
| ③ | `GET /api/model-risk?date={날짜}` | 날짜 바꿀 때 | ✅ |
| ④ | `GET /api/cells/{h3}?date={날짜}` | 셀 클릭할 때 | ✅ |
| ⑤ | `GET /api/facilities?type={시설종류}` | 119 마커 그릴 때 | 선택 |

### { } 에 들어갈 값

| 자리 | 형식 | 어디서 얻나 | 예 |
|---|---|---|---|
| `{날짜}` | `YYYY-MM-DD` | 사용자가 고른 날짜. 처음엔 ①의 `date_end` | `2021-08-01` |
| `{h3}` | 15자리 문자열 | 클릭한 셀의 `properties.h3` (숫자로 바꾸지 말 것) | `8830d1cf3bfffff` |
| `{시설종류}` | 문자열 | 현재는 `fire_station`(119안전센터) 하나 | `fire_station` |

`{날짜}` 는 **2011-01-01 ~ 2021-12-31** 만 가능. 날짜를 코드에 고정하지 말고 ①에서 받은 범위를 쓴다.

---

## ① `GET /api/model-risk/meta` — 모델 정보

페이지 처음 열 때 한 번 호출. **날짜 선택기의 범위와 범례 문구**를 여기서 가져온다.

```json
{
  "version": "backend_catboost_13_v3",
  "model_version": "catboost_app13_v3",
  "date_start": "2011-01-01",
  "date_end": "2021-12-31",
  "rows": 14669718,
  "cells_per_day": 3651,
  "loaded_at": "2026-10-11T08:11:13.786894+00:00",
  "legend": "선택 날짜의 상대 위험 순위",
  "score_note": "risk_score 는 사고 확률이 아닌 상대 순위용 점수, risk_percentile 은 그날 전체 셀 중 순위(0~100)",
  "limitations": [
    "역사적 지도 데이터이며 2026 실시간 예측이 아님",
    "과거 이력의 실제 다음날 공개 가용성 미검증",
    "교통량·관광객 노출량으로 보정하지 않음",
    "음성 1:20 표본화로 확률 미보정",
    "3651개 공간 모집단은 2025 경계 기반 고정 정의"
  ]
}
```

| 필드 | 쓰는 곳 |
|---|---|
| `date_start`, `date_end` | 날짜 선택기 min / max, 기본 날짜 = `date_end` |
| `legend` | 범례 제목 |
| `version` | 화면 하단 출처 표기 |
| `limitations` | (선택) "데이터 설명" 패널 |

---

## ② `GET /api/grid?date={날짜}` — 격자 + 그날 점수

처음 지도 그릴 때 호출. **H3 육각형 3,651개(추자도 포함)의 도형과 그날 모델 점수**를 GeoJSON FeatureCollection 으로 준다.

```json
{
  "type": "FeatureCollection",
  "model": {
    "date": "2021-08-01",
    "version": "backend_catboost_13_v3",
    "legend": "선택 날짜의 상대 위험 순위"
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[126.158166, 33.303916], [126.163103, 33.30576], "… 7개 점(닫힌 육각형)"]]
      },
      "properties": {
        "h3": "8830d02011fffff",
        "model_score": 0.008086739,
        "model_percentile": 51.616,
        "fire_station_dist_m": 2449,
        "fire_station_drive_min": 4.8,
        "fire_station_k1": 0,
        "score": 0.336,
        "level": 2,
        "ts": "2026-10-11T08:11:07+00:00",
        "ems_count": 1,
        "congestion": null
      }
    }
  ]
}
```

| 필드 | 뜻 | 프론트 사용 |
|---|---|---|
| `h3` | 셀 ID. 다른 API 와 연결하는 키 | D3 data key, ③·④ 매칭 |
| **`model_percentile`** | **그날 3,651셀 중 상대 순위 0~100** (높을수록 위험 순위 높음) | **셀 색** |
| `model_score` | 모델 원점수. 날짜마다 기준이 달라 날짜 간 비교 불가 | 색에 쓰지 말 것 |
| `fire_station_drive_min` / `_dist_m` | 가장 가까운 119까지 예상 주행시간(분, 근사) / 직선거리(m) | 툴팁 참고 정보 |
| `fire_station_k1` | 이 셀 + 인접 1칸 안 119 수 | 참고 |
| `score`, `level`, `ts`, `ems_count`, `congestion` | 백엔드 테스트용 더미 위험도·구급출동·혼잡도 | **사용하지 않음** |

- `date` 없이 호출하면 `model` 과 `model_*` 가 `null` (도형만 필요할 때)
- 육각형은 **시계 방향(CW)** 으로 내려준다. d3-geo 규칙에 맞춘 것이므로 `turf.rewind` 등으로 **뒤집지 말 것**
- (선택) `&bbox={최소경도},{최소위도},{최대경도},{최대위도}` 를 붙이면 그 범위 셀만 준다. 지금 규모(3,651개)에선 필요 없음

---

## ③ `GET /api/model-risk?date={날짜}` — 날짜 바꿀 때 점수만

날짜를 바꿀 때 호출. 도형 없이 **점수 목록만** 줘서 가볍다. ②에서 그린 path 의 색만 `h3` 로 매칭해 다시 칠한다.

```json
{
  "version": "backend_catboost_13_v3",
  "date": "2021-08-01",
  "legend": "선택 날짜의 상대 위험 순위",
  "cells": [
    { "h3": "8830d02011fffff", "score": 0.008086739, "percentile": 51.616 },
    { "h3": "8830d02013fffff", "score": 0.04826216, "percentile": 77.096 },
    "… 3,651개"
  ]
}
```

| 필드 | 뜻 |
|---|---|
| `cells[].h3` | 셀 ID (②의 `properties.h3` 와 매칭) |
| `cells[].percentile` | 그날 상대 순위 0~100 → **색** |
| `cells[].score` | 모델 원점수 (색에 쓰지 말 것) |

같은 날짜는 언제 호출해도 결과가 같다(과거 고정 데이터). 한 번 받은 날짜는 프론트에서 캐시해도 된다.

---

## ④ `GET /api/cells/{h3}?date={날짜}` — 셀 상세

셀을 클릭했을 때 호출. 툴팁·상세 패널용.

```json
{
  "h3": "8830d1cf3bfffff",
  "center": [126.48847562978672, 33.48915416135943],
  "model": {
    "date": "2021-08-01",
    "score": 0.76422375,
    "percentile": 100.0,
    "version": "backend_catboost_13_v3"
  },
  "facilities": {
    "fire_station": {
      "count_in_cell": 0,
      "count_k1": 1,
      "nearest_dist_m": 840,
      "nearest_drive_min": 1.6
    }
  },
  "risk": { "score": 1, "level": 5, "ts": "2026-10-11T08:11:07+00:00", "source": "dummy" },
  "ems": { "2021": 1124 },
  "congestion": null
}
```

| 필드 | 뜻 | 프론트 사용 |
|---|---|---|
| `center` | 셀 중심 [경도, 위도] | 툴팁 위치 등 |
| **`model.percentile`** | 그날 상대 순위 0~100 | **위험도 표시** (예: 100 → "그날 최상위") |
| `model.score` | 모델 원점수 | 부가 표시만 |
| `facilities.fire_station.*` | 119 거리·주행시간·개수 | 참고 정보 |
| `risk`, `ems`, `congestion` | 백엔드 테스트용 더미 값 | **사용하지 않음** |

`date` 를 빼면 `model` 이 `null`.

---

## ⑤ `GET /api/facilities?type={시설종류}` — 시설 마커 (선택)

119안전센터 24곳. 디자인에 마커가 없으면 호출하지 않아도 된다.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [126.86019, 33.52037] },
      "properties": {
        "id": 1,
        "type": "fire_station",
        "name": "구좌119안전센터",
        "address": "제주 제주시 구좌읍 세화14길 8",
        "h3": "8830d101e9fffff"
      }
    }
  ]
}
```

---

## 에러 응답

| 상황 | 코드 | 응답 | 프론트 처리 |
|---|---|---|---|
| 날짜가 범위(2011-01-01~2021-12-31) 밖 | 404 | `{"error":"데이터 없음","date":"2022-01-01","available":{"start":"2011-01-01","end":"2021-12-31"},"version":"backend_catboost_13_v3"}` | **"데이터 없음" 표시.** 0점·안전으로 칠하지 않기 |
| 날짜 형식 오류 | 400 | `{"error":"date 형식은 YYYY-MM-DD"}` | 입력값 확인 |
| ③에 date 없음 | 400 | `{"error":"date=YYYY-MM-DD 필요"}` | |
| 없는 셀 ID | 404 | `{"error":"격자에 없는 셀"}` | |

---

## 표시 규칙 (ML 담당 인수인계서 요구사항)

1. **색은 `percentile`(0~100)** 로 칠한다. `score` 는 날짜마다 기준이 달라 색에 쓰지 않는다.
2. 범례는 **"선택 날짜의 상대 위험 순위"** (①의 `legend`). **"사고 확률", "안전" 으로 표시하지 않는다.**
   - percentile 90 = 그날 상위 10% 라는 뜻이지 사고 확률 90% 가 아니다.
   - 같은 percentile 이라도 날짜가 다르면 절대 위험은 다르다.
3. **2011~2021 과거 점수다.** 오늘 날짜를 과거 같은 월·일에 연결해서 최신 예측처럼 보여주지 않는다.
4. 범위 밖 날짜·조회 실패는 **"데이터 없음"** 으로 표시한다. 0으로 채우지 않는다.

백엔드 확인용 지도(`http://localhost:8080`)는 다음 구간을 쓴다. 맞출 필요는 없지만 참고용.

| percentile | 구간 | 색 |
|---|---|---|
| 90 이상 (상위 10%) | 매우 높음 | `#d73027` |
| 70 ~ 90 | 높음 | `#fc8d59` |
| 30 ~ 70 | 보통 | `#fee08b` |
| 10 ~ 30 | 낮음 | `#ffeeb3` |
| 10 미만 (하위 10%) | 매우 낮음 | `#fffbe5` |

---

## D3 연결 예시

팀원 코드의 **투영·색 스케일·스타일**만 자기 것으로 바꾸면 된다.

```js
const API = 'http://localhost:8080';

// ① 날짜 범위·범례
const meta = await d3.json(`${API}/api/model-risk/meta`);
let date = meta.date_end;                       // 기본 날짜 (하드코딩하지 않기)
// 날짜 선택기: min = meta.date_start, max = meta.date_end, 범례 제목 = meta.legend

// ② 격자 + 그날 점수 (처음 한 번)
const grid = await d3.json(`${API}/api/grid?date=${date}`);
const projection = d3.geoMercator().fitSize([width, height], grid);  // ← 팀원 투영
const color = teamColorScale;                                        // ← 팀원 색 스케일 (입력: 0~100)

const cells = svg.selectAll('path.cell')
  .data(grid.features, d => d.properties.h3)
  .join('path')
    .attr('class', 'cell')
    .attr('d', d3.geoPath(projection))
    .attr('fill', d => color(d.properties.model_percentile));

// ③ 날짜 변경: 점수만 받아 색만 갱신
async function changeDate(newDate) {
  const res = await fetch(`${API}/api/model-risk?date=${newDate}`);
  if (res.status === 404) { showNoData(newDate); return; }   // 0으로 칠하지 않기
  const day = await res.json();
  const byH3 = new Map(day.cells.map(c => [c.h3, c.percentile]));
  cells.transition().attr('fill', d => color(byH3.get(d.properties.h3)));
  date = newDate;
}

// ④ 셀 클릭: 상세
cells.on('click', async (event, d) => {
  const cell = await d3.json(`${API}/api/cells/${d.properties.h3}?date=${date}`);
  // cell.model.percentile → "상위 X%" 표시, cell.facilities.fire_station → 119 정보
});

// ⑤ (선택) 119 마커
const fac = await d3.json(`${API}/api/facilities?type=fire_station`);
svg.selectAll('circle.fire').data(fac.features).join('circle')
  .attr('class', 'fire')
  .attr('cx', d => projection(d.geometry.coordinates)[0])
  .attr('cy', d => projection(d.geometry.coordinates)[1])
  .attr('r', 4);
```

---

## 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| 콘솔에 `CORS policy` / `Failed to fetch` | 백엔드 서버가 꺼져 있음(`go run ./cmd/server`), 또는 주소·IP 오타 |
| 화면이 통째로 한 색으로 덮임 | 폴리곤 방향 문제. 백엔드가 CW 로 주므로 프론트에서 뒤집지 말 것 |
| 아무것도 안 보이거나 점 하나에 몰림 | `fitSize(…, grid)` 안 함, 또는 좌표를 [위도, 경도] 로 착각 (GeoJSON 은 [경도, 위도]) |
| 날짜 바꾸면 404 | 2011-01-01 ~ 2021-12-31 밖. ①의 범위로 선택기 제한 |
| 일부 셀만 색이 안 칠해짐 | ③의 `h3` 와 ②의 `properties.h3` 매칭 확인 (문자열 그대로 비교) |

## 참고 (프론트에서 안 써도 되는 것)

- `GET /api/health` — 서버·DB 상태 확인 (`{"status":"ok"}`)
- 응답의 `score`, `level`, `ems_count`, `congestion`, `risk`, `ems` — 백엔드 테스트용 더미 값. 실시간 위험도가 붙으면 이 자리를 대체할 예정


## SKT 실시간 혼잡도 (2026-10-11)
`GET /api/congestion/live?poiId=2769058`: 모델 날짜와 독립적인 현재 장소 혼잡도.
응답: poiId, poiName, rltm[] (congestion: 명/㎡, congestionLevel: 1~4, datetime: KST YYYYMMDDHHmmss), fetched_at, cached, source, unit.
키는 서버 SKT_APP_KEY 또는 프로젝트 루트 .env.local에서 읽는다. 기본 장소는 아쿠아플라넷제주(2769058). 다른 지원 장소는 서버 SKT_POI_IDS에 쉼표로 추가한다.
버튼 클릭 시 조회, 성공 응답은 1시간 캐시. KST 일일 로컬 한도 10회(실패 포함), 디스크에 보관. 다른 프로그램의 동일 키 호출은 집계하지 못하고 다중 서버 한도 관리가 아니다.
400: 미허용 장소, 429: 한도, 503: 설정/저장 실패, 502: SKT 오류/결측. 오류는 0명으로 바꾸지 않는다.
지도 좌하단 패널에서 모델 지도와 함께 확인. 90분 이상 오래된 관측은 표시한다. 모델 점수를 조정하거나 H3 전체로 밀도를 확산하지 않는다.

한도는 `SKT_DAILY_LIMIT`로 설정(기본 10). 실제 계정 무료 할당량에 맞춰 설정해야 한다.


## 제주 실시간 주변 인구
`GET /api/population/live?lng=126.7324712&lat=33.4982282&radius=1450`
반환: lng, lat, radius_m, residents(도민), visitors(관광객), total, observed_at(KST 집계 시각), fetched_at, cached, source, history(원본 시간별 IN_POP/OUT_POP/TIME).
동일 조건은5분 메모리 캐시. lng126~127.1/lat33~34.2/radius50~5000m 서비스 입력 제한. 400입력 오류/502원천 조회 또는 결측 오류/503미설정. 자동 폴링 없음. 원천은 제주관광빅데이터플랫폼 내부 proxy API, User-Agent 외 로그인/키/쿠키 불필요로 검증. 역사적 모델 점수와 별도로 표시하며 길 위 보행자 수로 해석하지 않는다.
