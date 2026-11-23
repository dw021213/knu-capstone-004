import { createApiSource } from './api';
import { createSnapshotSource } from './snapshot';
import { createLiveWeatherLookup } from './weather';
import type { DataSource } from './types';

export interface DataEnv {
  VITE_DATA_MODE?: string;
  VITE_API_BASE?: string;
}

/** VITE_DATA_MODE=api면 백엔드, 그 외(기본)는 정적 스냅숏 */
export function selectDataSource(env: DataEnv): DataSource {
  if (env.VITE_DATA_MODE === 'api') return createApiSource(env.VITE_API_BASE ?? '');
  const snapshot = createSnapshotSource();
  return env.VITE_API_BASE
    ? { ...snapshot, getLiveWeather: createLiveWeatherLookup(env.VITE_API_BASE) }
    : snapshot;
}

export const dataSource: DataSource = selectDataSource(import.meta.env);

export type * from './types';
