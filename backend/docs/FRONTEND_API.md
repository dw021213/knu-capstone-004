# 프론트 연동 API 가이드

제주 위험도 지도 프론트가 백엔드에서 데이터를 받아 오는 방법을 정리한 문서다.
좌표·격자·위험도·시설은 모두 백엔드 DB 에 있으니 프론트는 **아래 API 를 호출해서 받은 데이터를 그리기만** 하면 된다.

- 주소: 로컬 `http://localhost:8080` / 운영 `https://{백엔드 도메인}` (deploy/DEPLOY.md)
- 모든 요청은 `GET`, 응답은 JSON / GeoJSON(UTF-8)
- CORS 허용 (운영에서는 `CORS_ORIGINS` 에 프론트 주소를 넣는다)
- 좌표는 GeoJSON 표준 **[경도, 위도]**

> **2026-10-17 변경 (`traffic_weather_v1`) — 프론트 반영 필요**
> 1. **유동인구(고립도)를 완전히 뺐다.** 응답에서 `isolation`, `population`, `hourly`, `condition`·`hour` 관련 값이 없어졌다.
>    `condition`, `hour` 쿼리는 무시된다. 시각은 `at` 하나로 정한다(기상 판별용).
> 2. **색은 `risk_percentile`**(모델 + 기상 가산), **가산 전 값은 `base_percentile`**. 둘이 짝이다.
>    `hazard_percentile`·`hazard_level` 은 `risk_*` 와 같은 값으로 당분간 남겨 둔다(지금 프론트 코드 호환). 새 코드는 `risk_*` 를 쓴다.
> 3. `/api/grid` 에 `road_source`(도로 자료 출처), `facility_counts`(셀 안 시설 수) 추가.
> 4. `/api/facilities?type=` 에 `cctv`, `convenience`, `lodging`, `police`, `er` 추가 (프론트 POI 파일과 같은 원천, `ext_id` = 프론트 `id`).
> 5. 기상 가산은 **호우 경보급일 때만 +0.15** (규칙 v4). 나머지 항목은 기준을 넘어도 표시만 한다(가산 0).

## 위험도는 어떻게 만드나 (`traffic_weather_v1`)

```
최종 위험점수 = min(1, 모델 위험점수 + 기상 가산)
  모델 위험점수 = 위험 모델 백분위 / 100   (지금은 교통사고 도로 모델 하나, 재난·범죄는 추가 예정 → 평균)
  기상 가산     = 그 시각 가장 가까운 AWS 지점이 호우 경보급(3시간 90mm 또는 12시간 180mm 이상)이면 +0.15
순위·등급      = 가산 전 모델 점수 분포에 대어 다시 매김 (가산되면 실제로 순위가 올라감)
```

| 구성 | 자료 | 비고 |
|---|---|---|
| 모델 위험점수 | ML 팀 **도로 전용 CatBoost 깊이 8, 우도·추자도 포함** (`jeju_h3_r8_road_d8_its20260914_ngii2025_v2`, 본섬 표준노드링크 2026-09-14 / 섬 수치지도 2025) | 날짜와 무관한 고정값. 도로 있는 2,249셀만 점수 있음 |
| 기상 가산 | 기상청 API허브 AWS 정시 관측 (제주 43개 지점, 서버가 15분마다 수집) | 관측 기반. 미래 시각에는 관측이 없어 가산 0 |

- 기상 가산값 근거: 2021 교통사고 구급신고에서 호우 경보급 격자·일의 사고율이 평소의 2.11배 → 모델 점수 0.15점과 같은 효과 (`config/weather_rules.json` 의 `evidence`).
- 도로 자료가 없는 셀(1,402개)은 위험도가 **null** → "도로 자료 없음"으로 표시. 안전하다는 뜻이 아니다.

## 한눈에 보기

| # | 호출 | 언제 | 필수 |
|---|---|---|---|
| ① | `GET /api/risk/meta` | 페이지 처음 열 때 | ✅ |
| ② | `GET /api/grid?at={시각}&weather={on/off}` | 처음 지도 그릴 때, 시각 바꿀 때 | ✅ |
| ③ | `GET /api/cells/{h3}?at={시각}&weather={on/off}` | 셀 클릭할 때 | ✅ |
| ④ | `GET /api/facilities?type={시설종류}` | 시설 마커 그릴 때 | 선택 |

| 자리 | 형식 | 예 |
|---|---|---|
| `{시각}` | `YYYY-MM-DDTHH:MM` (KST, 생략 시 지금). 분은 버리고 정시로 판별 | `2026-10-17T14:00` |
| `{on/off}` | 기상 가산 (생략 시 on) | `off` |
| `{h3}` | 15자리 문자열 (숫자로 바꾸지 말 것) | `8830d1cf3bfffff` |
| `{시설종류}` | ④의 표 (생략하면 전부) | `cctv` |
| `bbox` (선택) | `minLng,minLat,maxLng,maxLat` 로 범위 제한 | `126.4,33.2,126.7,33.4` |

---

## ① `GET /api/risk/meta` — 위험도 설명

```json
{
  "version": "traffic_weather_v1",
  "computed_at": "2026-10-13T11:07:58Z",
  "legend": "제주 상대 위험 순위 (도로 격자 기준)",
  "formula": "최종 = min(1, 모델 위험점수 + 기상 가산). …",
  "fields": "risk_* = 기상 가산 반영(지도 색), base_* = 가산 전 모델 점수, weather_bonus = 가산점",
  "hazards": [
    { "hazard": "traffic", "name": "교통사고", "label": "도로 특성 기반 상대 교통사고 위험도",
      "dataset_id": "jeju_h3_r8_road_d8_its20260914_ngii2025_v2", "snapshot_date": "2026-09-14",
      "limitations": ["…ML 팀 제한사항(영문)…"] }
  ],
  "hazards_planned": ["traffic", "disaster", "crime"],
  "levels": [
    { "level": 5, "label": "매우 높음", "min_percentile": 90 },
    { "level": 4, "label": "높음",     "min_percentile": 70 },
    { "level": 3, "label": "보통",     "min_percentile": 30 },
    { "level": 2, "label": "낮음",     "min_percentile": 10 },
    { "level": 1, "label": "매우 낮음", "min_percentile": 0 }
  ],
  "weather": { "rules": { "version": "weather_rules_v4", "rules": ["…항목별 기준·가산·근거…"] },
               "observations": [{ "source": "apihub", "from": "…", "to": "…", "rows": 1153 }], "…": "…" },
  "no_data": "…", "notes": ["…"]
}
```

| 필드 | 쓰는 곳 |
|---|---|
| `legend`, `levels` | 범례 제목, 등급 이름·경계 |
| `hazards[].snapshot_date` | 출처 표기 |
| `weather.rules` | "기상 기준" 안내 (항목별 `evidence` 에 근거 수치) |
| `version` | 화면 하단 버전 표기 |

---

## ② `GET /api/grid?at={시각}&weather=on` — 격자 + 위험도

H3 육각형 3,651개(추자도 포함)의 도형과 그 시각의 위험도를 GeoJSON FeatureCollection 으로 준다.

```json
{
  "type": "FeatureCollection",
  "risk": { "version": "traffic_weather_v1", "legend": "제주 상대 위험 순위 (도로 격자 기준)" },
  "weather": { "on": true, "at": "2021-09-14T09:00", "status": "ok", "rules_version": "weather_rules_v4",
               "max_bonus": 0.3, "stations_observed": 33, "stations_alerted": 15, "sources": ["kma_csv"] },
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[[126.70, 33.27], "…"]] },
      "properties": {
        "h3": "8830d1580bfffff",
        "risk_score": 0.6658, "risk_percentile": 66.56, "risk_level": 3,
        "base_score": 0.5158, "base_percentile": 51.58, "base_level": 3,
        "weather_bonus": 0.15,
        "weather_alerts": [{ "key": "heavy_rain", "label": "호우", "level": "warning", "metric": "rain_3h", "value": 96.5, "bonus": 0.15 }],
        "weather_stn": 885,
        "traffic_percentile": 51.58, "has_road": true, "road_source": "ITS_standard_nodelink",
        "facility_counts": { "cctv": 3, "convenience": 1 },
        "fire_station_dist_m": 1642, "fire_station_drive_min": 3.2, "fire_station_k1": 0,
        "hazard_percentile": 66.56, "hazard_level": 3
      }
    }
  ]
}
```

| 필드 | 뜻 | 프론트에서 |
|---|---|---|
| `h3` | 셀 ID. 다른 API 와 연결하는 키 | D3 data key, ③ 호출 |
| **`risk_percentile`**, `risk_level` | **최종 위험 순위 0~100 · 등급 1~5** (기상 가산 반영). 자료 없으면 null | **셀 색** |
| `risk_score` | 최종 점수 0~1 | 부가 표시 |
| **`base_percentile`**, `base_level`, `base_score` | **기상 가산 전** 모델 순위·등급·점수 | "기상 때문에 올랐다" 비교 |
| `weather_bonus` | 기상 가산점 (지금 규칙은 0 또는 0.15) | 툴팁·배지 |
| `weather_alerts` | 기준 초과 항목 `[{key, label, level(advisory/warning), metric, value, bonus}]`. `bonus` 0 이면 표시만 | 경고 아이콘·문구 |
| `weather_stn` | 연결된 AWS 지점 번호 | 참고 |
| `traffic_percentile` | 교통사고(도로) 모델 백분위 | 상세 패널 |
| `has_road` | 도로 자료가 있는지 | `false` 면 "도로 자료 없음" |
| `road_source` | `ITS_standard_nodelink`(본섬 표준노드링크 2026-09-14) / `NGII_digital_map`(우도·추자도 수치지도 2025) / `no_mapped_road` | 출처 칩 |
| `facility_counts` | 셀 안 시설 수 `{type: 개수}` (0 은 생략, 종류는 ④) | "주변 시설" |
| `fire_station_*` | 가장 가까운 119 거리(m)·예상 주행시간(분, 근사)·인접 119 수 | 참고 |
| `hazard_percentile`, `hazard_level` | `risk_*` 와 같은 값 (예전 코드 호환용, 곧 삭제) | 쓰지 않기 |

최상위 `weather.status`: `ok` 관측 있음 / `no_data` 그 시각 관측 없음(가산 0, 안전하다는 뜻 아님) / `off` 가산 끔.

---

## ③ `GET /api/cells/{h3}?at={시각}&weather=on` — 셀 상세

```json
{
  "h3": "8830d158abfffff",
  "center": [126.70, 33.27],
  "risk": { "score": 1, "percentile": 100, "level": 5,
            "base_score": 0.907, "base_percentile": 90.71, "base_level": 5,
            "weather_bonus": 0.15, "hazards_used": ["traffic"], "version": "traffic_weather_v1" },
  "weather": { "stn": 885, "name": "강정", "mountain": false, "dist_m": 2100, "status": "ok", "at": "2021-09-14T09:00",
               "metrics": { "temp": 24.1, "wind": 6.2, "rain_1h": 30.5, "rain_3h": 96.5, "rain_12h": 150.0, "humidity": 98, "…": "…" },
               "alerts": [{ "key": "heavy_rain", "label": "호우", "level": "warning", "bonus": 0.15, "…": "…" }], "bonus": 0.15 },
  "hazards": { "traffic": { "label": "도로 특성 기반 상대 교통사고 위험도", "percentile": 90.71, "available": true,
                            "dataset_id": "…", "snapshot_date": "2026-09-14",
                            "detail": { "road_source": "ITS_standard_nodelink", "road_snapshot_date": "2026-09-14" } } },
  "facilities": { "cctv": { "count_in_cell": 3, "count_k1": 9, "nearest_dist_m": 120, "nearest_drive_min": 0.2 },
                  "fire_station": { "count_in_cell": 0, "count_k1": 1, "nearest_dist_m": 840, "nearest_drive_min": 1.6 } }
}
```

- 도로 자료 없는 셀은 `risk` 가 `null`.
- `facilities` 는 종류별 셀 안 개수·인접 포함 개수·가장 가까운 거리(m).
- `weather.metrics` 는 판별에 쓴 지표 (3·12시간 누적 강수 등).

---

## ④ `GET /api/facilities?type={시설종류}` — 시설 마커

| `type` | 시설 | 개수 | 원천 |
|---|---|---|---|
| `fire_station` | 119안전센터 | 24 | 소방청 119안전센터 현황 |
| `cctv` | CCTV | 1,291 | 행정안전부 전국CCTV표준데이터 (2020년 기준 일부) |
| `convenience` | 편의점 | 1,300 | 소상공인시장진흥공단 상가정보 2026-06 |
| `lodging` | 숙박 | 1,153 | 소상공인시장진흥공단 상가정보 2026-06 |
| `police` | 지구대·파출소 | 25 | 경찰청 2025-12-31 (좌표 Nominatim) |
| `er` | 응급의료기관 | 6 | 제주특별자치도 2025-12-31 (좌표 Nominatim) |

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [126.9246, 33.471526] },
      "properties": { "id": 49, "ext_id": "cctv-1", "type": "cctv", "name": "서귀포서 성산읍 오조리 4-7", "address": null,
                      "h3": "8830d10f39fffff", "detail": { "purpose": "시설물관리", "cameras": 8 },
                      "source": "행정안전부 전국CCTV표준데이터(공공데이터포털, 2020년 기준 일부)" } }
  ]
}
```

---

## 에러 응답

| 상황 | 코드 | 응답 |
|---|---|---|
| 없는 셀 ID | 404 | `{"error":"격자에 없는 셀"}` |
| bbox 형식 오류 | 400 | `{"error":"bbox=minLng,minLat,maxLng,maxLat"}` |
| 시각 오류 | 400 | `{"error":"at 형식은 YYYY-MM-DDTHH:MM (KST)"}` |
| DB 오류 | 500 | `{"error":"…"}` |

---

## 표시 규칙 (ML 팀 인수인계서 요구사항 포함)

1. **색은 `risk_percentile`(0~100)** 로 칠한다.
2. 범례는 ①의 `legend`. **"사고 확률", "안전" 으로 표시하지 않는다.** percentile 90 = 도로 격자 중 상위 10% 라는 뜻.
3. `risk_percentile` 이 **null 인 셀은 "도로 자료 없음"** (회색 등). 0점·안전으로 칠하지 않는다.
4. 모델 점수는 날짜와 무관한 고정값이고, 시간에 따라 바뀌는 것은 **관측 기반 기상 가산뿐**이다. 예측이라고 쓰지 않는다.
5. 출처 표기: "교통사고 도로 모델(본섬 2026-09-14, 섬 수치지도 2025) + 기상청 AWS 관측 (호우 경보급 +0.15)"

백엔드 확인용 지도(`/`)의 색(참고): 90 이상 `#d73027` · 70~90 `#fc8d59` · 30~70 `#fee08b` · 10~30 `#ffeeb3` · 10 미만 `#fffbe5` · null `#bdbdbd`

---

## D3 연결 예시

```js
const API = 'https://{백엔드 도메인}';
const meta = await d3.json(`${API}/api/risk/meta`);           // 범례 제목 meta.legend, 등급 meta.levels

let at = null;                                                   // null = 지금
const q = () => `weather=on${at ? `&at=${at}` : ''}`;
const grid = await d3.json(`${API}/api/grid?${q()}`);
const projection = d3.geoMercator().fitSize([width, height], grid);
const NO_DATA = '#bdbdbd';
const pct = d => d.properties.risk_percentile;

const cells = svg.selectAll('path.cell')
  .data(grid.features, d => d.properties.h3)
  .join('path').attr('class', 'cell').attr('d', d3.geoPath(projection));

function paint() {
  cells.attr('fill', d => pct(d) == null ? NO_DATA : color(pct(d)))
       .attr('fill-opacity', d => pct(d) == null ? 0.35 : 0.8);
}
paint();

// 시각 변경: 다시 받아 색만 갱신 (도형은 같음)
async function changeTime(newAt) {
  at = newAt;
  const g = await d3.json(`${API}/api/grid?${q()}`);
  const byH3 = new Map(g.features.map(f => [f.properties.h3, f.properties]));
  cells.each(d => { d.properties = byH3.get(d.properties.h3); });
  paint();
}

// 셀 클릭
cells.on('click', async (event, d) => {
  const cell = await d3.json(`${API}/api/cells/${d.properties.h3}?${q()}`);
  if (!cell.risk) { /* "도로 자료 없음 (안전하다는 뜻 아님)" */ return; }
  // `상위 ${(100 - cell.risk.percentile).toFixed(1)}%`, 등급 cell.risk.level
  // 기상: cell.risk.weather_bonus > 0 이면 `호우 경보급 +0.15 (가산 전 상위 ${(100 - cell.risk.base_percentile).toFixed(1)}%)`
});

// 시설 마커
const cctv = await d3.json(`${API}/api/facilities?type=cctv`);
```

---

## 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| `CORS policy` / `Failed to fetch` | 백엔드가 꺼져 있음, 주소 오타, 또는 운영 `CORS_ORIGINS` 에 프론트 주소가 없음 |
| 화면이 통째로 한 색으로 덮임 | 폴리곤 방향 문제. 백엔드가 CW 로 주므로 프론트에서 뒤집지 말 것 |
| 아무것도 안 보이거나 점 하나에 몰림 | `fitSize(…, grid)` 안 함, 또는 좌표를 [위도, 경도] 로 착각 |
| 일부 셀이 `NaN` 색 | `risk_percentile` 이 null 인 셀. "도로 자료 없음" 으로 따로 칠할 것 |
| 기상 가산이 안 보임 | 그 시각에 호우 경보급 지점이 없거나(`weather_bonus` 0), `weather.status` 가 `no_data` |

## 참고 (프론트에서 안 써도 되는 것)

- `GET /api/health` — 서버·DB 상태 확인 (`{"status":"ok"}`)
- `dummy_*`, `ems_count`, `congestion`, `dummy`, `ems` — 백엔드 테스트용 값
