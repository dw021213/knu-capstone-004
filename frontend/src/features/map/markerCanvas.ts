import { SHAPE_PATH, type MarkerShape } from './markerShapes';
import type { View } from './view';

/** 지도 위 시설 한 개(marker) 또는 같은 종류 묶음(cluster). x, y는 그린 시점 화면 좌표 */
export interface MarkerItem {
  kind: 'cluster' | 'marker';
  /** 시설 종류 */
  group: string;
  shape: MarkerShape;
  x: number;
  y: number;
  /** marker: 시설 id */
  id?: string;
  /** cluster: 알약 글자와 개수 */
  label?: string;
  count?: number;
}

/** 그린 상자 [x0, y0, x1, y1](화면 좌표)를 붙인 항목. 누르기 판정과 e2e에 쓴다 */
export interface MarkerHit extends MarkerItem {
  box: [number, number, number, number];
}

/** 마커 배치에 넘기는 지도 상태. project는 경도·위도 → 화면 좌표(view 기준) */
export interface MarkerContext {
  width: number;
  height: number;
  zoom: number;
  view: View;
  project(lng: number, lat: number): [number, number];
}

export type MarkerLayout = (ctx: MarkerContext) => MarkerItem[];

/** 마커 반지름(그림) */
const MARKER_R = 9;
/** 마커를 누를 수 있는 반경: 44px 대상 */
export const MARKER_HIT_RADIUS = 22;
/** 알약 높이와 누르기 높이 */
export const PILL_H = 28;
const PILL_HIT_H = 44;
const PILL_PAD = 10;
const PILL_ICON = 12;
const PILL_GAP = 4;
const PILL_FONT_PX = 12;

export const pillText = (i: MarkerItem) => `${i.label} ${i.count}`;

const overlaps = (a: number[], b: number[]) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * 항목마다 그릴 상자를 정한다. 알약은 글자 폭으로 넓이를 재고, 앞서 놓은 알약과 겹치면
 * 위아래로 한 칸씩 비켜 본다(다 겹치면 제자리). 마커는 제자리.
 */
export function placeMarkers(items: MarkerItem[], measure: (text: string) => number): MarkerHit[] {
  const placed: MarkerHit['box'][] = [];
  const step = PILL_H + 2;
  return items.map((item) => {
    if (item.kind === 'marker') {
      const r = MARKER_R;
      return { ...item, box: [item.x - r, item.y - r, item.x + r, item.y + r] };
    }
    const w = PILL_PAD * 2 + PILL_ICON + PILL_GAP + measure(pillText(item));
    const at = (dy: number): MarkerHit['box'] => [
      item.x - w / 2,
      item.y + dy - PILL_H / 2,
      item.x + w / 2,
      item.y + dy + PILL_H / 2,
    ];
    let box = at(0);
    for (const dy of [0, step, -step, 2 * step, -2 * step]) {
      const b = at(dy);
      if (!placed.some((p) => overlaps(p, b))) {
        box = b;
        break;
      }
    }
    placed.push(box);
    return { ...item, x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2, box };
  });
}

/** 화면 점 (x, y)에서 누른 항목. 알약 상자(높이 44px로 넓힘) 안이면 알약, 아니면 반경 안 가장 가까운 마커 */
export function hitTest(hits: MarkerHit[], x: number, y: number): MarkerHit | null {
  const grow = (PILL_HIT_H - PILL_H) / 2;
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (h.kind !== 'cluster') continue;
    const [x0, y0, x1, y1] = h.box;
    if (x >= x0 && x <= x1 && y >= y0 - grow && y <= y1 + grow) return h;
  }
  let best: MarkerHit | null = null;
  let bestD = MARKER_HIT_RADIUS;
  for (const h of hits) {
    if (h.kind !== 'marker') continue;
    const d = Math.hypot(h.x - x, h.y - y);
    if (d <= bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

export interface MarkerDrawOptions {
  width: number;
  height: number;
  dpr: number;
  /** tokens.css의 --ink, --white, --font */
  ink: string;
  white: string;
  font: string;
  /** 크게 그릴 시설 id(카드를 연 마커) */
  highlight?: string | null;
}

const PATHS = new Map<MarkerShape, Path2D>();
function shapePath(shape: MarkerShape): Path2D {
  let p = PATHS.get(shape);
  if (!p) PATHS.set(shape, (p = new Path2D(SHAPE_PATH[shape])));
  return p;
}

function roundRect(ctx: CanvasRenderingContext2D, [x0, y0, x1, y1]: number[], r: number) {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
}

/** 글꼴을 맞춘 뒤 placeMarkers로 자리를 정하고 그린다. 그린 상자를 돌려준다 */
export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  items: MarkerItem[],
  o: MarkerDrawOptions,
): MarkerHit[] {
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.clearRect(0, 0, o.width, o.height);
  ctx.font = `700 ${PILL_FONT_PX}px ${o.font}`;
  const hits = placeMarkers(items, (t) => ctx.measureText(t).width);
  ctx.lineJoin = 'round';
  // 개별 마커: 검정 채움, 흰 테두리
  for (const h of hits) {
    if (h.kind !== 'marker') continue;
    const s = h.id != null && h.id === o.highlight ? 1.5 : 1;
    ctx.setTransform(o.dpr * s, 0, 0, o.dpr * s, h.x * o.dpr, h.y * o.dpr);
    const p = shapePath(h.shape);
    ctx.lineWidth = 2 / s + (s > 1 ? 1 : 0);
    ctx.strokeStyle = o.white;
    ctx.fillStyle = o.ink;
    ctx.fill(p);
    ctx.stroke(p);
  }
  // 묶음 알약: 검정 채움, 흰 테두리, 흰 모양 + 흰 글자
  ctx.textBaseline = 'middle';
  for (const h of hits) {
    if (h.kind !== 'cluster') continue;
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    roundRect(ctx, h.box, PILL_H / 2);
    ctx.fillStyle = o.ink;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = o.white;
    ctx.stroke();
    const ix = h.box[0] + PILL_PAD + PILL_ICON / 2;
    ctx.setTransform(o.dpr * 0.7, 0, 0, o.dpr * 0.7, ix * o.dpr, h.y * o.dpr);
    ctx.fillStyle = o.white;
    ctx.fill(shapePath(h.shape));
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    ctx.fillText(pillText(h), h.box[0] + PILL_PAD + PILL_ICON + PILL_GAP, h.y + 0.5);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return hits;
}
