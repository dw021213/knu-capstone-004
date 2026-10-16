import { latLngToCell } from 'h3-js';

/** 위경도가 속한 res8 셀. 점수 격자에 없는 셀(바다 등)이면 null */
export function cellAt(
  lng: number,
  lat: number,
  known: { has(h3: string): boolean },
): string | null {
  const h = latLngToCell(lat, lng, 8);
  return known.has(h) ? h : null;
}
