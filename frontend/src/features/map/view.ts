import { geoMercator, type GeoProjection } from 'd3';
import { JEJU_BOUNDS, makeWorldProjection, worldSize } from './projection';

/**
 * 화면 상태는 d3-zoom 변환 {k, x, y} 하나로 둔다.
 * 기준 줌 BASE_Z의 월드 픽셀 좌표 w에 대해 화면 좌표 = w × k + (x, y).
 */
export interface View {
  k: number;
  x: number;
  y: number;
}

export const BASE_Z = 9;
export const MAX_Z = 16;
/** d3-zoom scaleExtent: z9~16 */
export const SCALE_EXTENT: [number, number] = [1, 2 ** (MAX_Z - BASE_Z)];

/** 처음 화면에 맞추는 제주 본섬(우도 포함) 범위 */
export const ISLAND_BOUNDS = { west: 126.14, east: 126.98, south: 33.1, north: 33.58 } as const;

type Bounds = { west: number; east: number; south: number; north: number };

const base = makeWorldProjection(BASE_Z);
const S0 = worldSize(BASE_Z);

export const zoomLevel = (v: View) => BASE_Z + Math.log2(v.k);

export function lngLatToScreen(v: View, lng: number, lat: number): [number, number] {
  const [wx, wy] = base([lng, lat])!;
  return [wx * v.k + v.x, wy * v.k + v.y];
}

export function screenToLngLat(v: View, [sx, sy]: [number, number]): [number, number] {
  const [lng, lat] = base.invert!([(sx - v.x) / v.k, (sy - v.y) / v.k])!;
  return [lng, lat];
}

/** 화면 좌표로 바로 그리는 투영(canvas 그리기용). lngLatToScreen과 같은 수식 */
export function viewProjection(v: View): GeoProjection {
  const s = S0 * v.k;
  return geoMercator()
    .scale(s / (2 * Math.PI))
    .translate([s / 2 + v.x, s / 2 + v.y]);
}

/** 경계를 기준 줌 월드 픽셀 사각형으로 (d3-zoom translateExtent) */
export function worldExtent(b: Bounds = JEJU_BOUNDS): [[number, number], [number, number]] {
  const [x0, y0] = base([b.west, b.north])!;
  const [x1, y1] = base([b.east, b.south])!;
  return [
    [x0, y0],
    [x1, y1],
  ];
}

/** 경계가 화면에 들어오도록 맞춘 변환. 배율은 SCALE_EXTENT 안으로 자른다 */
export function fitView(
  width: number,
  height: number,
  b: Bounds = ISLAND_BOUNDS,
  pad = 0.06,
): View {
  const [[x0, y0], [x1, y1]] = worldExtent(b);
  const k0 = Math.min((width * (1 - 2 * pad)) / (x1 - x0), (height * (1 - 2 * pad)) / (y1 - y0));
  const k = Math.min(SCALE_EXTENT[1], Math.max(SCALE_EXTENT[0], k0));
  return { k, x: width / 2 - ((x0 + x1) / 2) * k, y: height / 2 - ((y0 + y1) / 2) * k };
}
