import { geoMercator, type GeoProjection } from 'd3';

export const TILE = 256;

/** 지도 이동을 묶어 두는 제주 경계(위경도). 북쪽은 추자도(약 34.01N)까지 넣는다 */
export const JEJU_BOUNDS = { west: 125.9, east: 127.2, south: 32.9, north: 34.05 } as const;

/** 줌 z에서 세계 전체의 픽셀 너비 */
export const worldSize = (z: number) => TILE * 2 ** z;

/** 슬리피 타일 공식으로 구한 월드 픽셀 좌표 */
export function tilePixel(lng: number, lat: number, z: number): [number, number] {
  const s = worldSize(z);
  const r = (lat * Math.PI) / 180;
  return [
    ((lng + 180) / 360) * s,
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s,
  ];
}

/** 줌 z의 월드 픽셀 좌표계로 투영하는 웹 메르카토르(타일과 같은 수식) */
export function makeWorldProjection(z: number): GeoProjection {
  const s = worldSize(z);
  return geoMercator()
    .scale(s / (2 * Math.PI))
    .translate([s / 2, s / 2]);
}
