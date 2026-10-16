// 테스트용 MSW 핸들러. 정적 스냅숏(/data/*.json)과 백엔드(/api/*) 응답을 같은 10개 셀로 재현한다.
// 백엔드 필드는 feat/backend 기준(hazard_percentile, hazard_level, has_road, weather.status).
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
  // 함정 (a): 도로 없는 셀인데 최종 점수가 1로 나오는 경우
  ['8830d02051fffff', null, 0],
  // 함정 (b): 유동인구를 켠 최종 백분위만 있고 교통 모델 백분위는 없는 경우
  ['8830d02053fffff', null, 1],
];

export const TRAP_SCORE_ONE = '8830d02051fffff';
export const TRAP_RISK_PERCENTILE = '8830d02053fffff';

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

function gridProperties([h3, p, code]: (typeof FIXTURE_CELLS)[number]) {
  const base = {
    h3,
    // 유동인구를 켠 값은 일부러 교통 모델 값과 다르게 둔다. 프론트는 읽지 않아야 한다.
    risk_score: p === null ? null : 0.5,
    risk_percentile: p === null ? null : 100 - p,
    risk_level: p === null ? null : hazardLevel(100 - p),
    hazard: p === null ? null : p / 100,
    hazard_percentile: p,
    hazard_level: hazardLevel(p),
    has_road: code !== 0,
    population: null,
  };
  if (h3 === TRAP_SCORE_ONE) return { ...base, risk_score: 1, risk_level: 1 };
  if (h3 === TRAP_RISK_PERCENTILE) return { ...base, risk_percentile: 50, risk_level: 3 };
  return base;
}

export type WeatherStatus = 'ok' | 'no_data' | 'off';

export function gridJson(weatherStatus: WeatherStatus = 'ok') {
  return {
    type: 'FeatureCollection',
    risk: { version: 'combined_v2', condition: 'weekday', hour: 21, auto_slot: true },
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
        type: 'fire_station',
        name: '구좌119안전센터',
        address: '제주 제주시 구좌읍 세화14길 8',
        h3: '8830d101e9fffff',
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
    const type = new URL(request.url).searchParams.get('type');
    return type === 'fire_station'
      ? HttpResponse.json(fireStationsJson)
      : HttpResponse.json({ type: 'FeatureCollection', features: [] });
  }),
];
