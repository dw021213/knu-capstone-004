// 테스트용 MSW 핸들러. 정적 스냅숏(/data/*.json)과 백엔드(/api/*) 응답을 같은 10개 셀로 재현한다.
// 백엔드 필드는 traffic_weather_v1 기준(backend/docs/FRONTEND_API.md): 색은 risk_percentile, 도로 출처는 road_source.
// 곧 삭제될 hazard_* 는 일부러 싣지 않는다. 프론트가 그 값에 기대지 않는지 본다.
import { http, HttpResponse } from 'msw';

export const SNAPSHOT_BASE = 'http://snapshot.test';
export const API_BASE = 'http://backend.test';

/** [h3, 교통 모델 백분위 | null, 도로 출처 코드(0 없음, 1 표준노드링크, 2 수치지도)] */
export const FIXTURE_CELLS: [string, number | null, 0 | 1 | 2][] = [
  ['8830d02011fffff', 3.6, 1],
  ['8830d02013fffff', 77.5, 1],
  ['8830d02085fffff', 10, 1],
  ['8830d02087fffff', 30, 1],
  ['8830d020c5fffff', 97.2, 1],
  ['8830d10c41fffff', 7.29, 2],
  ['8830d10c49fffff', 95.02, 2],
  ['8830d02019fffff', null, 0],
  // 함정: 도로 없는 셀인데 최종 점수가 1로 나오는 경우
  ['8830d02051fffff', null, 0],
];

export const TRAP_SCORE_ONE = '8830d02051fffff';
/** 기상 가산이 붙은 셀. 색은 가산 뒤 값(risk_percentile)으로 칠한다 */
export const BONUS_CELL = '8830d02087fffff';
export const BONUS_PERCENTILE = 45;

export const FIXTURE_DATASET_ID = 'jeju_h3_r8_road_islands_its20260914_ngii2025_v1';

export const snapshotScoresJson = {
  datasetId: FIXTURE_DATASET_ID,
  generatedAt: '2026-10-12T09:47:48.581628+09:00',
  roadCodes: { 0: 'none', 1: 'standard_link', 2: 'ngii_map' },
  cells: Object.fromEntries(FIXTURE_CELLS.map(([h3, p, code]) => [h3, [p, code]])),
};

function hazardLevel(p: number | null): number | null {
  if (p === null) return null;
  return p >= 90 ? 5 : p >= 70 ? 4 : p >= 30 ? 3 : p >= 10 ? 2 : 1;
}

const ROAD_SOURCE: Record<0 | 1 | 2, string> = {
  0: 'no_mapped_road',
  1: 'ITS_standard_nodelink',
  2: 'NGII_digital_map',
};

function gridProperties([h3, p, code]: (typeof FIXTURE_CELLS)[number]) {
  const base = {
    h3,
    risk_score: p === null ? null : p / 100,
    risk_percentile: p,
    risk_level: hazardLevel(p),
    base_score: p === null ? null : p / 100,
    base_percentile: p,
    base_level: hazardLevel(p),
    weather_bonus: 0,
    has_road: code !== 0,
    road_source: ROAD_SOURCE[code],
  };
  if (h3 === TRAP_SCORE_ONE) return { ...base, risk_score: 1 };
  return base;
}

/** 기상 가산 셀 하나를 넣은 격자. 가산 전 값(base_percentile)은 FIXTURE 값 그대로다 */
export function gridJsonWithBonus() {
  const grid = gridJson();
  for (const f of grid.features) {
    if (f.properties.h3 === BONUS_CELL) {
      Object.assign(f.properties, {
        risk_percentile: BONUS_PERCENTILE,
        risk_level: hazardLevel(BONUS_PERCENTILE),
        weather_bonus: 0.15,
      });
    }
  }
  return grid;
}

export type WeatherStatus = 'ok' | 'no_data' | 'off';

export function gridJson(weatherStatus: WeatherStatus = 'ok') {
  return {
    type: 'FeatureCollection',
    risk: { version: 'traffic_weather_v1', legend: '제주 상대 위험 순위 (도로 격자 기준)' },
    weather: { on: weatherStatus !== 'off', status: weatherStatus },
    features: FIXTURE_CELLS.map((cell) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: gridProperties(cell),
    })),
  };
}

export const fireStationsJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [126.86019, 33.52037] },
      properties: {
        id: 1,
        ext_id: '구좌119안전센터',
        type: 'fire_station',
        name: '구좌119안전센터',
        address: '제주 제주시 구좌읍 세화14길 8',
        h3: '8830d101e9fffff',
        detail: {},
        source: null,
      },
    },
  ],
};

export const cctvJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [126.9246, 33.471526] },
      properties: {
        id: 49,
        ext_id: 'cctv-1',
        type: 'cctv',
        name: '서귀포서 성산읍 오조리 4-7',
        address: null,
        h3: '8830d10f39fffff',
        detail: { purpose: '시설물관리', cameras: 8 },
        source: '테스트 CCTV',
      },
    },
  ],
};

export const snapshotFireJson = {
  source: '테스트 스냅숏',
  items: [{ id: 'fire-1', type: 'fire', name: '구좌119안전센터', lat: 33.52037, lng: 126.86019 }],
};

export const snapshotErJson = {
  type: 'er',
  status: 'ready',
  source: '테스트 응급의료기관',
  fetchedAt: '2026-10-17',
  items: [
    {
      id: 'er-1',
      type: 'er',
      name: '제주한라병원',
      lat: 33.490209,
      lng: 126.485005,
      detail: { kind: '권역응급의료센터' },
    },
  ],
};

/** 백엔드 /api/facilities?type=er. 스냅숏 er.json 과 같은 원천이라 같은 항목을 돌려준다 */
export const erFacilitiesJson = {
  type: 'FeatureCollection',
  features: snapshotErJson.items.map((item, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
    properties: {
      id: 3818 + i,
      ext_id: item.id,
      type: 'er',
      name: item.name,
      address: null,
      h3: '8830d1cf3bfffff',
      detail: item.detail,
      source: snapshotErJson.source,
    },
  })),
};

const FACILITIES: Record<string, unknown> = {
  fire_station: fireStationsJson,
  cctv: cctvJson,
  er: erFacilitiesJson,
};

/** 마지막으로 받은 /api/grid 요청 URL(쿼리 단언용) */
export const seen: { gridUrl: URL | null } = { gridUrl: null };

export const handlers = [
  http.get(`${SNAPSHOT_BASE}/data/scores.json`, () => HttpResponse.json(snapshotScoresJson)),
  http.get(`${SNAPSHOT_BASE}/data/poi/fire.json`, () => HttpResponse.json(snapshotFireJson)),
  http.get(`${SNAPSHOT_BASE}/data/poi/er.json`, () => HttpResponse.json(snapshotErJson)),
  // 아직 만들지 않은 시설·코스 파일: Vercel처럼 404
  http.get(`${SNAPSHOT_BASE}/data/poi/:type`, () => new HttpResponse(null, { status: 404 })),
  http.get(`${SNAPSHOT_BASE}/data/courses.json`, () => new HttpResponse(null, { status: 404 })),
  http.get(`${API_BASE}/api/grid`, ({ request }) => {
    seen.gridUrl = new URL(request.url);
    return HttpResponse.json(gridJson());
  }),
  http.get(`${API_BASE}/api/facilities`, ({ request }) => {
    const type = new URL(request.url).searchParams.get('type') ?? '';
    return HttpResponse.json(FACILITIES[type] ?? { type: 'FeatureCollection', features: [] });
  }),
];
