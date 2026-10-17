import { geoMercator, type GeoProjection, type ZoomTransform } from 'd3';
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

/** 본섬 해안선(우도 포함, 마라도 제외) 범위. 첫 화면은 이것을 가림 사이 영역에 맞춘다 */
export const COAST_BOUNDS = { west: 126.15, east: 126.97, south: 33.19, north: 33.57 } as const;

/** 본섬 중심(첫 화면에서 지도 가운데에 둘 점) [경도, 위도] */
export const ISLAND_CENTER: [number, number] = [126.53, 33.38];

type Bounds = { west: number; east: number; south: number; north: number };

/** 지도 위에 얹힌 것이 가리는 위(검색·탭)·아래(날짜 칩) 높이(CSS px) */
export interface Insets {
  top: number;
  bottom: number;
}

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

/**
 * 검색으로 고른 곳 보기: 경계 상자가 화면 가로 80%·세로 50% 안에 들도록 맞춘 줌을 minZ~maxZ로 자르고,
 * 점은 가로 가운데·세로 anchorY(모바일 셀 시트 위쪽)에 둔다.
 * right: 오른쪽에서 가리는 너비(px, 데스크톱 코스 패널). 가로는 그 왼쪽 영역 기준으로 맞춘다
 */
export function focusView(
  width: number,
  height: number,
  b: Bounds,
  [lng, lat]: [number, number],
  { minZ = 12, maxZ = 14, anchorY = 0.4, right = 0 } = {},
): View {
  const [[x0, y0], [x1, y1]] = worldExtent(b);
  const area = Math.max(1, width - right);
  const fit = Math.min((area * 0.8) / (x1 - x0), (height * 0.5) / (y1 - y0));
  const k = Math.min(2 ** (maxZ - BASE_Z), Math.max(2 ** (minZ - BASE_Z), fit));
  const [wx, wy] = base([lng, lat])!;
  return { k, x: area / 2 - wx * k, y: height * anchorY - wy * k };
}

/**
 * 첫 화면: 본섬 해안선(COAST_BOUNDS)이 위·아래 가림 사이 영역에 들도록 맞추고, 본섬 중심(ISLAND_CENTER)을
 * 그 영역 가운데에 둔다. 넓은 화면에서 이동 경계(JEJU_BOUNDS) 가로폭이 화면보다 좁으면 끌기가 경계에서
 * 멈추지 않으므로, 본섬이 영역 안에 그대로 들어가는 한 경계 가로폭이 화면을 덮을 만큼 확대한다.
 */
export function homeView(
  width: number,
  height: number,
  { top, bottom }: Insets = { top: 0, bottom: 0 },
  pad = 0.06,
): View {
  const area = Math.max(1, height - top - bottom);
  const [[x0, y0], [x1, y1]] = worldExtent(COAST_BOUNDS);
  const [[ex0], [ex1]] = worldExtent(JEJU_BOUNDS);
  const fit = Math.min((width * (1 - 2 * pad)) / (x1 - x0), (area * (1 - 2 * pad)) / (y1 - y0));
  const fitTight = Math.min(width / (x1 - x0), area / (y1 - y0));
  const cover = width / (ex1 - ex0);
  const k0 = Math.max(fit, Math.min(cover, fitTight));
  const k = Math.min(SCALE_EXTENT[1], Math.max(SCALE_EXTENT[0], k0));
  const [cx, cy] = base(ISLAND_CENTER)!;
  return { k, x: width / 2 - cx * k, y: top + area / 2 - cy * k };
}

/**
 * d3-zoom constrain. 이동 경계가 화면보다 큰 축은 d3 기본처럼 화면이 경계 밖으로 나가지 않게 하고,
 * 화면보다 작은 축은 d3 기본처럼 가운데로 끌어오지 않고 경계가 화면 안에 다 들어 있게만 한다
 * (모바일 첫 화면에서 추자도까지 넣은 경계 때문에 본섬이 아래로 밀리지 않게).
 */
export function constrainView(
  t: ZoomTransform,
  extent: [[number, number], [number, number]],
  translateExtent: [[number, number], [number, number]],
): ZoomTransform {
  const fix = (d0: number, d1: number) =>
    d1 > d0 ? Math.max(0, d0) || Math.min(0, d1) : Math.min(0, d0) || Math.max(0, d1);
  const dx0 = t.invertX(extent[0][0]) - translateExtent[0][0];
  const dx1 = t.invertX(extent[1][0]) - translateExtent[1][0];
  const dy0 = t.invertY(extent[0][1]) - translateExtent[0][1];
  const dy1 = t.invertY(extent[1][1]) - translateExtent[1][1];
  return t.translate(fix(dx0, dx1), fix(dy0, dy1));
}
