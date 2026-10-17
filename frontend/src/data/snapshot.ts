import { levelFromPercentile } from '../entities/risk/level';
import type {
  CellScore,
  CourseFile,
  CourseList,
  DataSource,
  PoiFile,
  PoiLayer,
  PoiType,
  RoadSource,
  Scores,
  ScoresFile,
} from './types';

const ROAD_BY_CODE: Record<number, RoadSource> = { 1: 'standard_link', 2: 'ngii_map' };

export function roadSourceFromCode(code: number | undefined): RoadSource {
  return (code !== undefined && ROAD_BY_CODE[code]) || 'none';
}

export function toCellScore(
  h3: string,
  percentile: number | null,
  roadSource: RoadSource,
): CellScore {
  const level = levelFromPercentile(percentile);
  return { h3, percentile, level, roadSource, status: level === null ? 'no_data' : 'ok' };
}

export async function fetchScoresFile(base: string): Promise<ScoresFile> {
  const res = await fetch(`${base}/data/scores.json`);
  if (!res.ok) throw new Error(`점수 파일을 받지 못했습니다 (${res.status})`);
  return (await res.json()) as ScoresFile;
}

/** 파일이 아직 없으면(404, 또는 SPA 폴백 HTML) null */
async function fetchOptionalJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} 응답 ${res.status}`);
  if (!res.headers.get('content-type')?.includes('json')) return null;
  return (await res.json()) as T;
}

/** 배포본에 함께 실린 public/data/*.json을 읽는다. base는 테스트에서 절대 주소를 줄 때 쓴다 */
export function createSnapshotSource(base = ''): DataSource {
  return {
    mode: 'snapshot',
    async getScores(): Promise<Scores> {
      const file = await fetchScoresFile(base);
      const cells = new Map<string, CellScore>();
      for (const [h3, [p, code]] of Object.entries(file.cells)) {
        cells.set(h3, toCellScore(h3, p, roadSourceFromCode(code)));
      }
      return { datasetId: file.datasetId, generatedAt: file.generatedAt, cells, weather: 'off' };
    },
    async getPoi(type: PoiType): Promise<PoiLayer> {
      const file = await fetchOptionalJson<PoiFile>(`${base}/data/poi/${type}.json`);
      if (!file) return { type, status: 'pending', source: '', items: [] };
      return { type, status: file.status ?? 'ready', source: file.source, items: file.items };
    },
    async getCourses(): Promise<CourseList> {
      const file = await fetchOptionalJson<CourseFile>(`${base}/data/courses.json`);
      if (!file) return { status: 'pending', source: '', items: [] };
      return { status: 'ready', source: file.source, items: file.items };
    },
  };
}
