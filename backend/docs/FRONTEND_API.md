# 프론트 연동 API 가이드

제주 위험도 지도 프론트(D3.js)가 백엔드에서 데이터를 받아 오는 방법을 정리한 문서다.
좌표·격자·위험도는 모두 백엔드 DB 에 있으니 프론트는 **아래 API 를 호출해서 받은 데이터를 그리기만** 하면 된다.

- 기본 주소: `http://localhost:8080`
  - 다른 PC 에서 붙을 때: `http://{백엔드 PC IP}:8080` (같은 와이파이)
- 모든 요청은 `GET`, 응답은 JSON / GeoJSON(UTF-8)
- CORS 허용됨 (다른 포트·주소의 프론트에서 바로 호출 가능)
- 좌표는 GeoJSON 표준 **[경도, 위도]**

## 위험도는 어떻게 만들었나 (`combined_v2`)

```
최종 위험도 = 0.8 × 위해도 + 0.2 × 고립도
  위해도 = 위험 모델 백분위 평균 (지금은 교통사고만, 재난·범죄는 추가 예정)
  고립도 = 1 − 유동인구 백분위 (가장 붐비는 셀 0, 가장 한산한 셀 1)

  ※ 고립도와 최종 순위는 "모든 조건 × 0~23시 × 셀" 을 한 줄로 세운 공통 기준으로 매긴다.
     → 같은 장소도 사람이 적은 새벽엔 위험도가 올라가고, 시간대끼리 색을 비교할 수 있다.
```

| 구성 | 자료 | 비고 |
|---|---|---|
| 교통사고 | ML 팀 **도로 전용 CatBoost, 우도·추자도 포함** (`jeju_h3_r8_road_islands_its20260914_ngii2025_v1`, 본섬 표준노드링크 2026-09-14 / 섬 수치지도 2025) | 차로·제한속도·교차로 등 도로 특성 입력(섬 49셀은 도로 길이·밀도·개수 3개만). 도로 있는 2,249셀만 점수 있음 |
| 고립도 | 2015-01 제주도민 250m 격자 **시간대별** 유동인구 (조건 8종 × 0~23시, 하루 평균으로 환산) | 2015 분포를 현재로 가정, 관광객 미포함 |

- **교통사고(도로) 점수는 고정**이고, **고립도는 조건·시간대에 따라 바뀐다.**
  - 조건(`condition`): `all` 전체, `weekday` 평일, `holiday` 휴일, `preholiday` 휴일전날, `clear` 맑음, `cloudy` 흐림, `rain` 비, `snow` 눈
  - 시간대(`hour`): 0~23
  - 안 주면 **`at`(기본 지금) 한국 시각** 기준(토·일=휴일, 금=휴일전날, 그 외=평일 / 그 시각의 시). 공휴일은 아직 미반영
- **유동인구 켜기/끄기**: 응답에 두 버전이 다 들어 있다. 다시 호출할 필요 없이 쓰는 필드만 바꾸면 된다.

  | 유동인구(고립도) | 색에 쓸 필드 | 등급 |
  |---|---|---|
  | 켬 (기본) | `risk_percentile` | `risk_level` |
  | 끔 (교통사고 모델만) | `hazard_percentile` | `hazard_level` |
- 도로 자료가 없는 셀(1,451개, 우도·추자도 포함)은 위험도가 **null** → "도로 자료 없음"으로 표시.

---

### 기상 가산 (2026-10-13 추가)

```
최종 = min(1, 위 점수 + min(0.3, Σ 기준 초과 항목 가중치))
```
- 셀마다 **가장 가까운 제주 AWS 지점(43곳)**의 관측이 우리 기준(기상청 특보 기준 참고, 공식 특보 아님)을 넘으면 더한다.
  호우(3·12시간 강수), 강풍(풍속, 산지 기준 별도), 대설, 폭염(체감온도), 한파(기온), 건조(최근 24시간 평균 습도). 주의보급·경보급 두 단계.
- 실시간: 서버가 15분마다 기상청 API허브에서 수집. 과거: 같은 방식으로 저장된 관측으로 계산 → **`at=` 로 과거 시각을 넣으면 그때 기준으로 판별**
- 등급은 가산 전 점수 분포에 대어 다시 매기므로, 기준을 넘은 지역은 실제로 순위·등급이 올라간다.
- 기준·가중치는 `config/weather_rules.json` (`/api/risk/meta` 의 `weather.rules` 로도 볼 수 있음)

## 한눈에 보기

| # | 호출 | 언제 | 필수 |
|---|---|---|---|
| ① | `GET /api/risk/meta` | 페이지 처음 열 때 | ✅ |
| ② | `GET /api/grid?at={시각}&condition={조건}&hour={시간}&weather={on/off}` | 처음 지도 그릴 때, 시각·조건 바꿀 때 | ✅ |
| ③ | `GET /api/cells/{h3}?at={시각}&condition={조건}&hour={시간}&weather={on/off}` | 셀 클릭할 때 | ✅ |
| ④ | `GET /api/facilities?type={시설종류}` | 119 마커 그릴 때 | 선택 |

| 자리 | 형식 | 어디서 얻나 | 예 |
|---|---|---|---|
| `{시각}` | `YYYY-MM-DDTHH:MM` (KST, 생략 시 지금) | 사용자가 고른 날짜·시간 | `2021-08-23T19:00` |
| `{on/off}` | 기상 가산 (생략 시 on) | 토글 | `off` |
| `{조건}` | 위 8개 중 하나 (생략 가능) | 사용자 선택. 처음엔 ①의 `default_slot.condition` | `weekday` |
| `{시간}` | 0~23 (생략 가능) | 사용자 선택. 처음엔 ①의 `default_slot.hour` | `21` |
| `{h3}` | 15자리 문자열 | 클릭한 셀의 `properties.h3` (숫자로 바꾸지 말 것) | `8830d1cf3bfffff` |
| `{시설종류}` | 문자열 | 현재는 `fire_station`(119안전센터) 하나 | `fire_station` |

> 이전 버전의 `/api/model-risk`, `?date=` 는 **삭제됨** (2011~2021 날짜별 모델을 도로 전용 모델로 교체).

---

## ① `GET /api/risk/meta` — 위험도 설명

범례 문구, 등급 구간, 들어간 모델·자료 정보를 준다. 범례·"데이터 설명" 패널에 쓴다.

```json
{
  "version": "combined_v2",
  "computed_at": "2026-10-11T16:58:56Z",
  "legend": "제주 상대 위험 순위 (모든 시간대 공통 기준)",
  "formula": "최종 = 0.8 × 위해도(가용 위험 모델 백분위 평균) + 0.2 × 고립도(1 − 유동인구 백분위)",
  "weights": { "hazard": 0.8, "isolation": 0.2 },
  "hazards": [
    {
      "hazard": "traffic",
      "name": "교통사고",
      "label": "도로 특성 기반 상대 교통사고 위험도",
      "dataset_id": "jeju_h3_r8_road_islands_its20260914_ngii2025_v1",
      "snapshot_date": "2026-09-14",
      "limitations": ["…ML 팀 제한사항(영문)…"]
    }
  ],
  "hazards_planned": ["traffic", "disaster", "crime"],
  "population": {
    "source": "제주도민 250m 격자 시간대별 유동인구",
    "std_ym": "2015-01",
    "assumption": "2015년 1월 제주도민 시간대별 유동인구 분포를 현재 패턴으로 가정 (관광객 미포함)"
  },
  "conditions": [
    { "key": "all", "label": "전체", "group": "all" },
    { "key": "weekday", "label": "평일", "group": "day" },
    { "key": "holiday", "label": "휴일", "group": "day" },
    { "key": "preholiday", "label": "휴일전날", "group": "day" },
    { "key": "clear", "label": "맑음", "group": "weather" },
    { "key": "cloudy", "label": "흐림", "group": "weather" },
    { "key": "rain", "label": "비", "group": "weather" },
    { "key": "snow", "label": "눈", "group": "weather" }
  ],
  "hours": { "min": 0, "max": 23 },
  "default_slot": { "condition": "weekday", "hour": 21, "rule": "condition·hour 를 안 주면 현재 한국 시각: …" },
  "levels": [
    { "level": 5, "label": "매우 높음", "min_percentile": 90 },
    { "level": 4, "label": "높음",     "min_percentile": 70 },
    { "level": 3, "label": "보통",     "min_percentile": 30 },
    { "level": 2, "label": "낮음",     "min_percentile": 10 },
    { "level": 1, "label": "매우 낮음", "min_percentile": 0 }
  ],
  "no_data": "위험 모델 입력자료가 없는 셀(예: 도로 자료 없는 셀)은 risk_* 가 null. 안전으로 표시하지 않는다",
  "notes": [
    "risk_percentile 은 셀 간 상대 순위이며 사고 확률이 아니다",
    "날짜·시간에 따라 바뀌는 예측이 아니라 현재 도로 자료와 유동인구 분포 기준의 고정 점수다"
  ]
}
```

| 필드 | 쓰는 곳 |
|---|---|
| `legend` | 범례 제목 |
| `conditions`, `hours` | 조건 선택 목록, 시간 슬라이더 범위 |
| `default_slot` | 처음 보여줄 조건·시간 (현재 한국 시각 기준) |
| `levels` | 등급 이름·경계 (백분위 기준) |
| `hazards[].snapshot_date`, `population.assumption` | 범례 아래 출처·가정 표기 |
| `version` | 화면 하단 버전 표기 |

---

## ② `GET /api/grid?condition={조건}&hour={시간}` — 격자 + 위험도

처음 지도 그릴 때, 그리고 조건·시간을 바꿀 때 호출. **H3 육각형 3,651개(추자도 포함)의 도형과 그 조건·시간대의 위험도**를 GeoJSON FeatureCollection 으로 준다.

```json
{
  "type": "FeatureCollection",
  "risk": { "version": "combined_v2", "legend": "제주 상대 위험 순위 (모든 시간대 공통 기준)",
            "condition": "weekday", "hour": 21, "auto_slot": false },
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[[126.163103, 33.30576], "… 7개 점(닫힌 육각형)"]] },
      "properties": {
        "h3": "8830d02013fffff",
        "risk_score": 0.6595,
        "risk_percentile": 75.4,
        "risk_level": 4,
        "hazard": 0.7664,
        "hazard_percentile": 76.63,
        "hazard_level": 4,
        "isolation": 0.2321,
        "traffic_percentile": 76.64,
        "has_road": true,
        "population": 98.3,
        "fire_station_dist_m": 1642,
        "fire_station_drive_min": 3.2,
        "fire_station_k1": 0,
        "dummy_score": 0.493, "dummy_level": 3, "ems_count": 6, "congestion": null
      }
    }
  ]
}
```

도로 자료 없는 셀 예 — 위험도 필드가 모두 `null`:
```json
{ "h3": "8830d02019fffff", "risk_score": null, "risk_percentile": null, "risk_level": null,
  "hazard": null, "isolation": 0.9189, "traffic_percentile": null, "has_road": false, "population": null, "…": "…" }
```

| 필드 | 뜻 | 프론트 사용 |
|---|---|---|
| `h3` | 셀 ID. 다른 API 와 연결하는 키 | D3 data key, ③ 호출 |
| **`risk_percentile`** | **최종 위험도 순위 0~100** — 모든 조건·시간대·셀 공통 기준 (높을수록 위험, 새벽이 낮보다 높게 나옴). 자료 없으면 null | **셀 색** |
| `risk_level` | 등급 1~5 (①의 `levels` 경계) | 범주형 색·라벨을 쓸 때 |
| `risk_score` | 최종 점수 0~1 | 부가 표시 |
| `hazard` | 위해도 0~1 (위험 모델 백분위 평균) | 상세 패널 |
| `hazard_percentile`, `hazard_level` | **유동인구를 끈** 위험도 순위·등급 (위해도만, 기상 가산 포함) | 유동인구 끔일 때 색 |
| `base_percentile`, `base_level` | 기상 가산 **전** 순위·등급 | "기상 때문에 올랐다" 표시 |
| `weather_bonus` | 기상 가산점 (0~0.3) | 툴팁 |
| `weather_alerts` | 기준 초과 항목 `[{key, label, level(advisory/warning), metric, value, bonus}]` | 경고 아이콘·문구 |
| `weather_stn` | 연결된 AWS 지점 번호 | 참고 |
| `isolation` | 고립도 0~1 (1 = 가장 한산) | 상세 패널 |
| `traffic_percentile` | 교통사고(도로) 모델 백분위 0~100 | 상세 패널 |
| `has_road` | 이 셀에 도로 자료가 있는지 | `false` 면 "도로 자료 없음" |
| `population` | 그 조건·시간대 유동인구 합 (없으면 null = 0명으로 계산) | 상세 패널 |
| `fire_station_*` | 가장 가까운 119 거리(m)·예상 주행시간(분, 근사)·인접 119 수 | 툴팁 참고 정보 |
| `dummy_score`, `dummy_level`, `ems_count`, `congestion` | 백엔드 테스트용 값 | **사용하지 않음** |

- 육각형은 **시계 방향(CW)** 으로 내려준다. d3-geo 규칙에 맞춘 것이므로 `turf.rewind` 등으로 **뒤집지 말 것**
- (선택) `?bbox={최소경도},{최소위도},{최대경도},{최대위도}` 로 범위 셀만 받을 수 있다. 지금 규모에선 필요 없음
- 같은 조건·시간 응답은 항상 같다(2015 패턴 기반). 한 번 받은 슬롯은 캐시해도 된다
- `risk.auto_slot` 이 true 면 조건·시간을 안 줘서 at 시각 기준으로 정해졌다는 뜻
- 최상위 `weather`: `{on, at, status(ok|no_data|off), stations_observed, stations_alerted, rules_version, max_bonus, sources}`.
  `status: "no_data"` 면 그 시각 관측이 없어 가산 0 (안전하다는 뜻 아님)

---

## ③ `GET /api/cells/{h3}?condition={조건}&hour={시간}` — 셀 상세

셀을 클릭했을 때 호출. 툴팁·상세 패널용. ②와 같은 조건·시간을 넘긴다.

```json
{
  "h3": "8830d1cf3bfffff",
  "center": [126.48847562978672, 33.48915416135943],
  "risk": {
    "condition": "weekday",
    "hour": 18,
    "auto_slot": false,
    "score": 0.7901818,
    "percentile": 96.407455,
    "level": 5,
    "hazard": 0.9877273,
    "isolation": 0,
    "hazards_used": ["traffic"],
    "hazard_percentile": 98.77,
    "hazard_level": 5,
    "version": "combined_v2",
    "computed_at": "2026-10-11T16:58:56.452967+00:00"
  },
  "hazards": {
    "traffic": {
      "label": "도로 특성 기반 상대 교통사고 위험도",
      "percentile": 98.77273,
      "score": 0.4546484,
      "available": true,
      "dataset_id": "jeju_h3_r8_road_islands_its20260914_ngii2025_v1",
      "snapshot_date": "2026-09-14",
      "detail": { "road_source": "ITS_standard_nodelink", "feature_coverage": "standard_link_attributes", "road_snapshot_date": "2026-09-14" }
    }
  },
  "hourly": [
    { "hour": 0, "percentile": 96.36, "level": 5, "isolation": 0.0, "population": 1601.2 },
    "… 0~23시 24개 (같은 조건)"
  ],
  "population": { "value": 3766.5, "condition": "weekday", "hour": 18, "std_ym": "2015-01", "file": "…_평일_20150131.csv" },
  "facilities": {
    "fire_station": { "count_in_cell": 0, "count_k1": 1, "nearest_dist_m": 840, "nearest_drive_min": 1.6 }
  },
  "dummy": { "…": "백엔드 테스트용" },
  "ems": { "2021": 1124 },
  "congestion": null
}
```

| 필드 | 뜻 | 프론트 사용 |
|---|---|---|
| **`risk.percentile`**, `risk.level` | 최종 위험도 순위·등급 (자료 없으면 `score`·`percentile`·`level`·`hazard` 가 null) | **위험도 표시** (예: 96.4 → "상위 3.6%") |
| `risk.hazard`, `risk.isolation` | 구성 요소 → "위해도 0.988 × 0.8 + 고립도 0.000 × 0.2" 같은 설명 | 상세 패널 |
| `risk.hazard_percentile`, `risk.hazard_level` | 유동인구를 끈 순위·등급 | 유동인구 끔일 때 |
| `hazards.traffic.percentile` | 교통사고(도로) 모델 순위. 재난·범죄가 들어오면 `hazards.disaster`, `hazards.crime` 이 추가됨 | 상세 패널 |
| `hazards.traffic.detail` | 셀의 도로자료 출처. `road_source`: `ITS_standard_nodelink`(본섬 표준노드링크, `road_snapshot_date`) / `NGII_digital_map`(우도·추자도 수치지도, `island_map_year`, `feature_coverage=geometry_only` 도로 형상만 사용) / `no_mapped_road` | 상세 패널에 출처 표기 |
| `hourly[]` | 같은 조건의 0~23시 순위·등급·유동인구 (기상 가산 제외) | 시간대별 그래프 |
| `risk.base_*`, `risk.weather_bonus` | 기상 가산 전 값, 가산점 | 상세 패널 |
| `weather` | `{stn, name, mountain, dist_m, metrics{temp, wind, rain_1h, rain_3h, rain_12h, humidity, humidity_24h, feels_like, snow_24h}, alerts[], bonus, at, status}` | "진달래밭(산지) 6.4km · 3h 67mm · 호우 주의보급" 같은 설명 |
| `population.value` | 그 조건·시간대 유동인구 (없으면 `population` 자체가 null) | 상세 패널 |
| `facilities.fire_station.*` | 119 정보 | 참고 |
| `dummy`, `ems`, `congestion` | 백엔드 테스트용 | **사용하지 않음** |

---

## ④ `GET /api/facilities?type={시설종류}` — 시설 마커 (선택)

119안전센터 24곳. 디자인에 마커가 없으면 호출하지 않아도 된다.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [126.86019, 33.52037] },
      "properties": { "id": 1, "type": "fire_station", "name": "구좌119안전센터", "address": "제주 제주시 구좌읍 세화14길 8", "h3": "8830d101e9fffff" }
    }
  ]
}
```

---

## 에러 응답

| 상황 | 코드 | 응답 |
|---|---|---|
| 없는 셀 ID | 404 | `{"error":"격자에 없는 셀"}` |
| bbox 형식 오류 | 400 | `{"error":"bbox=minLng,minLat,maxLng,maxLat"}` |
| 조건 오류 | 400 | `{"error":"condition 은 all|weekday|holiday|preholiday|clear|cloudy|rain|snow"}` |
| 시간 오류 | 400 | `{"error":"hour 는 0~23"}` |
| 시각 오류 | 400 | `{"error":"at 형식은 YYYY-MM-DDTHH:MM (KST)"}` |
| DB 오류 | 500 | `{"error":"…"}` |

---

## 표시 규칙 (ML 팀 인수인계서 요구사항 포함)

1. **색은 `risk_percentile`(0~100)** 로 칠한다.
2. 범례는 ①의 `legend` ("제주 상대 위험 순위 (모든 시간대 공통 기준)"). **"사고 확률", "안전" 으로 표시하지 않는다.**
   - percentile 90 = 모든 시간대·셀 중 상위 10% 라는 뜻이지 사고 확률 90% 가 아니다.
3. `risk_percentile` 이 **null 인 셀은 "도로 자료 없음"** (회색 등)으로 표시한다. 0점·안전으로 칠하지 않는다.
4. **실시간 관측으로 설명하지 않는다.** 도로 자료(2026-09-14) + 2015-01 시간대별 유동인구 패턴 기반이다.
5. 출처 표기: "교통사고(도로자료 2026-09-14) 80% + 고립도(2015-01 도민 시간대별 유동인구, 현재로 가정) 20%"

백엔드 확인용 지도(`http://localhost:8080`)는 다음 색을 쓴다. 맞출 필요는 없지만 참고용.

| risk_percentile | 등급 | 색 |
|---|---|---|
| 90 이상 (상위 10%) | 5 매우 높음 | `#d73027` |
| 70 ~ 90 | 4 높음 | `#fc8d59` |
| 30 ~ 70 | 3 보통 | `#fee08b` |
| 10 ~ 30 | 2 낮음 | `#ffeeb3` |
| 10 미만 (하위 10%) | 1 매우 낮음 | `#fffbe5` |
| null | 도로 자료 없음 | `#bdbdbd` (투명도 낮게) |

---

## D3 연결 예시

팀원 코드의 **투영·색 스케일·스타일**만 자기 것으로 바꾸면 된다.

```js
const API = 'http://localhost:8080';

// ① 범례·등급 구간
const meta = await d3.json(`${API}/api/risk/meta`);
// 범례 제목 = meta.legend, 등급 = meta.levels

// ② 격자 + 위험도 (처음은 현재 시각 기준 슬롯)
let condition = meta.default_slot.condition, hour = meta.default_slot.hour;
const grid = await d3.json(`${API}/api/grid?condition=${condition}&hour=${hour}`);
const projection = d3.geoMercator().fitSize([width, height], grid);  // ← 팀원 투영
const color = teamColorScale;                                        // ← 팀원 색 스케일 (입력: 0~100)
const NO_DATA = '#bdbdbd';

let usePopulation = true;   // 유동인구(고립도) 켜기/끄기
const pct = d => usePopulation ? d.properties.risk_percentile : d.properties.hazard_percentile;

const cells = svg.selectAll('path.cell')
  .data(grid.features, d => d.properties.h3)
  .join('path')
    .attr('class', 'cell')
    .attr('d', d3.geoPath(projection));

function paint() {
  cells
    .attr('fill', d => pct(d) == null ? NO_DATA : color(pct(d)))
    .attr('fill-opacity', d => pct(d) == null ? 0.35 : 0.8);
}
paint();

// 토글: 다시 호출하지 않고 색만 다시 칠한다
toggle.on('change', e => { usePopulation = e.target.checked; paint(); });

// 조건·시간 변경: 그 슬롯의 격자를 다시 받아 색만 갱신 (도형은 같음)
async function changeSlot(newCondition, newHour) {
  condition = newCondition; hour = newHour;
  const g = await d3.json(`${API}/api/grid?condition=${condition}&hour=${hour}`);
  const byH3 = new Map(g.features.map(f => [f.properties.h3, f.properties]));
  cells.each(d => { d.properties = byH3.get(d.properties.h3); });
  paint();
}

// ③ 셀 클릭: 상세
cells.on('click', async (event, d) => {
  const cell = await d3.json(`${API}/api/cells/${d.properties.h3}?condition=${condition}&hour=${hour}`);
  if (cell.risk?.percentile == null) {
    // "도로 자료 없음 (안전하다는 뜻 아님)"
  } else {
    // `상위 ${(100 - cell.risk.percentile).toFixed(1)}%`, 등급 cell.risk.level
    // 구성: 위해도 cell.risk.hazard × 0.8 + 고립도 cell.risk.isolation × 0.2
  }
});

// ④ (선택) 119 마커
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
| 일부 셀이 `NaN` 색 | `risk_percentile` 이 null 인 셀. "도로 자료 없음" 으로 따로 칠할 것 |
| `/api/model-risk` 404 | 삭제된 API. `/api/grid`, `/api/risk/meta` 사용 |

## 참고 (프론트에서 안 써도 되는 것)

- `GET /api/health` — 서버·DB 상태 확인 (`{"status":"ok"}`)
- `dummy_*`, `ems_count`, `congestion`, `dummy`, `ems` — 백엔드 테스트용 값
