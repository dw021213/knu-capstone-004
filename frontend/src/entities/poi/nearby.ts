import type { PoiLayer, PoiType } from '../../data/types';
import { distanceMeters } from '../../shared/geo/distance';

export const POI_TYPES: readonly PoiType[] = ['cctv', 'convenience', 'lodging', 'police', 'fire'];

export interface NearbyCount {
  r300: number;
  r500: number;
}

/**
 * 셀 중심 [경도, 위도]에서 반경 안(경계 포함) 시설 수. 지구 표면(하버사인) 거리로 센다.
 * 넘겨받지 못했거나 아직 자료가 없는(pending) 종류는 'pending'.
 */
export function countNearby(
  center: [number, number],
  layers: PoiLayer[],
  radii: [number, number] = [300, 500],
): Record<PoiType, NearbyCount | 'pending'> {
  const out = Object.fromEntries(POI_TYPES.map((t) => [t, 'pending'])) as Record<
    PoiType,
    NearbyCount | 'pending'
  >;
  const [near, far] = radii;
  for (const layer of layers) {
    if (layer.status !== 'ready') continue;
    const count: NearbyCount = { r300: 0, r500: 0 };
    for (const p of layer.items) {
      const d = distanceMeters(center, [p.lng, p.lat]);
      if (d <= near) count.r300++;
      if (d <= far) count.r500++;
    }
    out[layer.type] = count;
  }
  return out;
}

/** 가장 가까운 항목과 직선거리(m). 항목이 없으면 null */
export function nearest<T extends { lng: number; lat: number }>(
  center: [number, number],
  layer: { items: readonly T[] },
): { poi: T; meters: number } | null {
  let best: { poi: T; meters: number } | null = null;
  for (const p of layer.items) {
    const meters = distanceMeters(center, [p.lng, p.lat]);
    if (!best || meters < best.meters) best = { poi: p, meters };
  }
  return best;
}
