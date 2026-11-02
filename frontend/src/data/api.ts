import { createSnapshotSource, fetchScoresFile, toCellScore } from './snapshot';
import type {
  CellScore,
  DataSource,
  EmergencyList,
  EmergencyRoom,
  Poi,
  PoiLayer,
  PoiType,
  RoadSource,
  Scores,
} from './types';

// 백엔드 응답에서 읽는 필드만 적는다(traffic_weather_v1, backend/docs/FRONTEND_API.md).
// 색은 risk_percentile(교통 모델 백분위 + at 시각의 기상 가산)로 칠한다. 가산 전 값은 base_percentile 이고,
// weather.status 가 no_data 면 가산이 0이다. snapshot 모드의 백분위는 기상을 반영하지 않은 날짜 무관 공간 점수라
// 두 모드 값이 다를 수 있다.
interface GridProperties {
  h3: string;
  risk_percentile?: number | null;
  road_source?: string | null;
}

interface GridResponse {
  weather?: { status?: 'ok' | 'no_data' | 'off' };
  features: { properties: GridProperties }[];
}

interface FacilitiesResponse {
  features: {
    geometry: { coordinates: [number, number] };
    properties: {
      id: number | string;
      ext_id?: string | null;
      name: string;
      address?: string | null;
      detail?: Record<string, string | number> | null;
      source?: string | null;
    };
  }[];
}

const WEATHER: Record<string, Scores['weather']> = { ok: 'on', no_data: 'no_data', off: 'off' };

const ROAD: Record<string, RoadSource> = {
  ITS_standard_nodelink: 'standard_link',
  NGII_digital_map: 'ngii_map',
};

/** 프론트 시설 종류 → 백엔드 /api/facilities?type= */
const FACILITY_TYPE: Record<PoiType, string> = {
  cctv: 'cctv',
  convenience: 'convenience',
  lodging: 'lodging',
  police: 'police',
  fire: 'fire_station',
};

const FACILITIES_SOURCE = '백엔드 /api/facilities';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 응답 ${res.status}`);
  return (await res.json()) as T;
}

type Facility = FacilitiesResponse['features'][number];

/** 스냅숏 파일과 같은 모양으로 바꾼다. id 는 백엔드 ext_id(= 스냅숏 id), 119 는 ext_id 가 이름이라 fire-<id> */
function toPoint(prefix: string, { geometry, properties: p }: Facility) {
  const id = prefix === 'fire' || !p.ext_id ? `${prefix}-${p.id}` : p.ext_id;
  const detail = { ...(p.detail ?? {}), ...(p.address ? { address: p.address } : {}) };
  return {
    id,
    name: p.name,
    lng: geometry.coordinates[0],
    lat: geometry.coordinates[1],
    ...(Object.keys(detail).length ? { detail } : {}),
  };
}

/**
 * 백엔드(VITE_API_BASE)를 부른다. 격자·시설·응급실은 백엔드에서 받는다.
 * 데이터 버전(datasetId)은 격자 응답에 없어 같은 버전의 스냅숏 점수 파일에서 붙이고, 코스는 스냅숏 파일을 쓴다.
 */
export function createApiSource(apiBase = '', snapshotBase = ''): DataSource {
  const snapshot = createSnapshotSource(snapshotBase);
  const facilities = (type: string) =>
    getJson<FacilitiesResponse>(`${apiBase}/api/facilities?type=${type}`);
  return {
    mode: 'api',
    async getScores(opts?: { at?: string }): Promise<Scores> {
      const params = new URLSearchParams({ weather: 'on' });
      if (opts?.at) params.set('at', opts.at);
      const [grid, file] = await Promise.all([
        getJson<GridResponse>(`${apiBase}/api/grid?${params}`),
        fetchScoresFile(snapshotBase).catch(() => null),
      ]);
      const cells = new Map<string, CellScore>();
      for (const { properties: p } of grid.features) {
        const roadSource = ROAD[p.road_source ?? ''] ?? 'none';
        cells.set(p.h3, toCellScore(p.h3, p.risk_percentile ?? null, roadSource));
      }
      return {
        // 백엔드 risk.version(traffic_weather_v1)은 데이터 버전이 아니라서 쓰지 않는다
        datasetId: file?.datasetId ?? '',
        cells,
        weather: WEATHER[grid.weather?.status ?? 'no_data'] ?? 'no_data',
      };
    },
    async getPoi(type: PoiType): Promise<PoiLayer> {
      const { features } = await facilities(FACILITY_TYPE[type]);
      if (features.length === 0) return { type, status: 'pending', source: '', items: [] };
      const items: Poi[] = features.map((f) => ({ ...toPoint(type, f), type }));
      return {
        type,
        status: 'ready',
        source: features[0].properties.source ?? FACILITIES_SOURCE,
        items,
      };
    },
    async getEmergency(): Promise<EmergencyList> {
      const { features } = await facilities('er');
      if (features.length === 0) return { status: 'pending', source: '', items: [] };
      const items: EmergencyRoom[] = features.map((f) => ({ ...toPoint('er', f), type: 'er' }));
      return { status: 'ready', source: features[0].properties.source ?? FACILITIES_SOURCE, items };
    },
    getCourses: () => snapshot.getCourses(),
  };
}
