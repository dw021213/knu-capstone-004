import { latLngToCell } from 'h3-js';
import { screenToLngLat, type View } from './view';

/** 위경도가 속한 res8 셀. 점수 격자에 없는 셀(바다 등)이면 null */
export function cellAt(
  lng: number,
  lat: number,
  known: { has(h3: string): boolean },
): string | null {
  const h = latLngToCell(lat, lng, 8);
  return known.has(h) ? h : null;
}

/** 화면 좌표 → 역변환 → 위경도 → 셀 */
export function cellAtScreen(
  view: View,
  point: [number, number],
  known: { has(h3: string): boolean },
): string | null {
  const [lng, lat] = screenToLngLat(view, point);
  return cellAt(lng, lat, known);
}
