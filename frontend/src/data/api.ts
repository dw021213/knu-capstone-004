import { createSnapshotSource, fetchScoresFile, roadSourceFromCode, toCellScore } from './snapshot';
import type { CellScore, DataSource, Poi, PoiLayer, PoiType, RoadSource, Scores } from './types';

// 백엔드 /api/grid 응답에서 읽는 필드만 적는다. 색은 유동인구를 끈 교통 모델 백분위(hazard_percentile)로 칠한다.
interface GridProperties {
  h3: string;
  hazard_percentile?: number | null;
  has_road?: boolean | null;
}

interface GridResponse {
  risk?: { version?: string };
  weather?: { status?: 'ok' | 'no_data' | 'off' };
  features: { properties: GridProperties }[];
}

interface FacilitiesResponse {
  features: {
    geometry: { coordinates: [number, number] };
    properties: { id: number | string; name: string; address?: string | null };
  }[];
}

const WEATHER: Record<string, Scores['weather']> = { ok: 'on', no_data: 'no_data', off: 'off' };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 응답 ${res.status}`);
  return (await res.json()) as T;
}

/**
 * 백엔드(VITE_API_BASE)를 부른다. 격자 응답에는 도로 출처가 has_road뿐이라
 * 표준노드링크·수치지도 구분은 같은 데이터 버전의 스냅숏 파일에서 붙인다.
 * 백엔드에 없는 시설(119 외)과 코스는 스냅숏 파일을 쓴다.
 */
export function createApiSource(apiBase = '', snapshotBase = ''): DataSource {
  const snapshot = createSnapshotSource(snapshotBase);
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
        const percentile = p.hazard_percentile ?? null;
        let roadSource: RoadSource = 'none';
        if (p.has_road) {
          const fromFile = roadSourceFromCode(file?.cells[p.h3]?.[1]);
          roadSource = fromFile === 'none' ? 'standard_link' : fromFile;
        }
        cells.set(p.h3, toCellScore(p.h3, percentile, roadSource));
      }
      return {
        datasetId: file?.datasetId ?? grid.risk?.version ?? '',
        cells,
        weather: WEATHER[grid.weather?.status ?? 'no_data'] ?? 'no_data',
      };
    },
    async getPoi(type: PoiType): Promise<PoiLayer> {
      if (type !== 'fire') return snapshot.getPoi(type);
      const res = await getJson<FacilitiesResponse>(`${apiBase}/api/facilities?type=fire_station`);
      const items: Poi[] = res.features.map(({ geometry, properties }) => ({
        id: `fire-${properties.id}`,
        type: 'fire',
        name: properties.name,
        lng: geometry.coordinates[0],
        lat: geometry.coordinates[1],
        ...(properties.address ? { detail: { address: properties.address } } : {}),
      }));
      return { type, status: 'ready', source: '백엔드 /api/facilities', items };
    },
    getCourses: () => snapshot.getCourses(),
  };
}
