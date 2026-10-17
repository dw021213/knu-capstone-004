import { createApiSource } from './api';
import { createSnapshotSource } from './snapshot';
import type { DataSource } from './types';

export interface DataEnv {
  VITE_DATA_MODE?: string;
  VITE_API_BASE?: string;
}

/** VITE_DATA_MODE=api면 백엔드, 그 외(기본)는 정적 스냅숏 */
export function selectDataSource(env: DataEnv): DataSource {
  return env.VITE_DATA_MODE === 'api'
    ? createApiSource(env.VITE_API_BASE ?? '')
    : createSnapshotSource();
}

export const dataSource: DataSource = selectDataSource(import.meta.env);

export type * from './types';
