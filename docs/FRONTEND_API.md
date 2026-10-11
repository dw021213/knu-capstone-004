# 프론트 연동 가이드 (D3.js)

백엔드가 좌표·격자·위험도를 모두 DB 에 갖고 있고, API 가 **GeoJSON(경도·위도, EPSG:4326)** 으로 내려준다.
프론트는 좌표를 따로 저장할 필요 없이 API 를 받아 그리기만 하면 된다.

- 기본 주소: `http://localhost:8080` (백엔드 PC 에서 `go run ./cmd/server`)
- 같은 네트워크의 다른 PC 에서 붙을 때: `http://<백엔드 PC IP>:8080`
- CORS: 기본은 모든 origin 허용(개발용). 막을 땐 백엔드에 `CORS_ORIGINS=http://localhost:5173` 처럼 지정
- 육각형 폴리곤은 **시계 방향(CW)** 으로 내려준다 → d3-geo 에서 바로 `path` 로 그리면 됨 (rewind 불필요)

## 엔드포인트

### `GET /api/grid` — 위험도 격자 (FeatureCollection, Polygon 3,483개)
쿼리: `bbox=minLng,minLat,maxLng,maxLat` (생략 시 전체)

```json
{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [[[126.52, 33.49], ...]] },
  "properties": {
    "h3": "8830d1cf3bfffff",       // H3 res8 셀 ID (다른 API 와 연결 키)
    "score": 0.579,                // 위험도 0~1 (색은 이걸로)
    "level": 3,                    // 위험 등급 1~5 (score 0.2 간격)
    "ts": "2026-10-07T12:04:11+00:00",
    "ems_count": 1124,             // 구급출동 건수 (없으면 null)
    "congestion": 0.82,            // 혼잡도 0~1 (없으면 null)
    "fire_station_dist_m": 512,    // 최근접 119 직선거리(m)
    "fire_station_drive_min": 1.0, // 최근접 119 예상 주행시간(분, 근사)
    "fire_station_k1": 1           // 이 셀 + 인접 1칸 안 119 수
  }
}
```

### `GET /api/facilities?type=fire_station` — 시설 점 (FeatureCollection, Point)
properties: `id, type, name, address, h3`

### `GET /api/cells/:h3` — 셀 상세 (클릭 팝업용, 일반 JSON)
```json
{
  "h3": "8830d1cf3bfffff",
  "center": [126.53, 33.49],
  "risk": { "score": 0.579, "level": 3, "ts": "...", "source": "dummy" },
  "ems": { "2021": 1124 },
  "congestion": { "value": 0.82, "ts": "...", "source": "test" },
  "facilities": { "fire_station": { "count_in_cell": 0, "count_k1": 1, "nearest_dist_m": 512, "nearest_drive_min": 1.0 } }
}
```

### `GET /api/health`
`{"status":"ok"}`

## D3 최소 예제

```html
<svg id="map" width="900" height="600"></svg>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<script>
const API = 'http://localhost:8080';
const svg = d3.select('#map');
const { width, height } = svg.node().getBoundingClientRect();

// 위험도 색: 백엔드 지도(web/index.html)와 같은 크림→노랑→주황→빨강
const color = d3.scaleLinear()
  .domain([0.1, 0.3, 0.5, 0.7, 0.9])
  .range(['#fffbe5', '#ffeeb3', '#fee08b', '#fc8d59', '#d73027'])
  .clamp(true);

Promise.all([
  d3.json(`${API}/api/grid`),
  d3.json(`${API}/api/facilities?type=fire_station`),
]).then(([grid, fac]) => {
  // 제주 격자 전체가 화면에 맞도록 투영 설정
  const projection = d3.geoMercator().fitSize([width, height], grid);
  const path = d3.geoPath(projection);

  svg.append('g').selectAll('path')
    .data(grid.features)
    .join('path')
      .attr('d', path)
      .attr('fill', d => color(d.properties.score))
      .attr('stroke', '#555').attr('stroke-width', 0.2)
      .on('click', async (e, d) => {
        const cell = await d3.json(`${API}/api/cells/${d.properties.h3}`);
        console.log(cell);
      });

  svg.append('g').selectAll('circle')
    .data(fac.features)
    .join('circle')
      .attr('cx', d => projection(d.geometry.coordinates)[0])
      .attr('cy', d => projection(d.geometry.coordinates)[1])
      .attr('r', 4).attr('fill', '#c00').attr('stroke', '#fff')
    .append('title').text(d => d.properties.name);
});
</script>
```

## 자주 막히는 곳
| 증상 | 원인 / 해결 |
|---|---|
| 콘솔에 `CORS policy` 에러 | 백엔드가 꺼져 있거나 `CORS_ORIGINS` 에 프론트 주소가 없음 |
| 화면이 통째로 한 색으로 덮임 | 폴리곤 방향 문제. 백엔드가 CW 로 주므로 프론트에서 `turf.rewind` 등으로 **뒤집지 말 것** |
| 아무것도 안 보임 / 점 하나에 몰림 | 투영에 `fitSize(…, grid)` 안 함, 또는 좌표를 [위도, 경도]로 착각 (GeoJSON 은 [경도, 위도]) |
| 데이터는 오는데 너무 느림 | 3,483개 path 는 SVG 로 충분. 더 늘면 `bbox` 로 화면 범위만 요청하거나 canvas 사용 |
