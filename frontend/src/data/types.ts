import type { Level } from '../entities/risk/level';

export type RoadSource = 'standard_link' | 'ngii_map' | 'none';

export interface CellScore {
  h3: string;
  /** 교통 모델 백분위 0~100. 도로 자료가 없으면 null(데이터 부족) */
  percentile: number | null;
  level: Level | null;
  roadSource: RoadSource;
  status: 'ok' | 'no_data';
}

export interface Scores {
  datasetId: string;
  /** 점수 파일 생성 시각(ISO, snapshot 모드만) */
  generatedAt?: string;
  cells: Map<string, CellScore>;
  /** off: 반영 안 함(스냅숏), on: 기상 가산 반영, no_data: 그 시각 관측 없음 */
  weather: 'off' | 'on' | 'no_data';
}

export type PoiType = 'cctv' | 'convenience' | 'lodging' | 'police' | 'fire';

export interface Poi {
  id: string;
  type: PoiType;
  name: string;
  lat: number;
  lng: number;
  detail?: Record<string, string | number>;
}

export interface PoiLayer {
  type: PoiType;
  /** pending: 아직 자료를 받지 못함(화면에 '준비 중') */
  status: 'ready' | 'pending';
  source: string;
  items: Poi[];
}

export interface Course {
  id: string;
  name: string;
  lengthKm: number;
  /** [lng, lat] */
  coords: [number, number][];
}

export interface CourseList {
  status: 'ready' | 'pending';
  source: string;
  items: Course[];
}

export interface DataSource {
  mode: 'snapshot' | 'api';
  getScores(opts?: { at?: string }): Promise<Scores>;
  getPoi(type: PoiType): Promise<PoiLayer>;
  getCourses(): Promise<CourseList>;
}

/** public/data/scores.json (scripts/build-scores.mjs 생성물) */
export interface ScoresFile {
  datasetId: string;
  generatedAt: string;
  roadCodes: Record<string, string>;
  cells: Record<string, [number | null, number]>;
}

/** public/data/poi/<type>.json (scripts/build-poi.mjs 생성물). status가 없으면 ready로 본다 */
export interface PoiFile {
  type?: PoiType;
  status?: 'ready' | 'pending';
  source: string;
  /** 원본을 받은 날(YYYY-MM-DD) */
  fetchedAt?: string;
  items: Poi[];
}

/** public/data/courses.json */
export interface CourseFile {
  source: string;
  items: Course[];
}
