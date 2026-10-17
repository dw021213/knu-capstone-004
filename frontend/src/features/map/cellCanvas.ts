import { geoPath } from 'd3';
import type { CellScore } from '../../data/types';
import type { Level } from '../../entities/risk/level';
import {
  CELL_FILL_OPACITY,
  CELL_STROKE_COLOR,
  CELL_STROKE_WIDTH,
  DIM_FILL_OPACITY,
  NO_DATA_COLOR,
  NO_DATA_HATCH_COLOR,
  RISK_COLOR,
  SELECTED_STROKE_COLOR,
} from '../../entities/risk/colors';
import { cellCenter, cellPolygon } from '../../shared/geo/h3';
import { lngLatToScreen, viewProjection, type View } from './view';

export interface PreparedCell {
  h3: string;
  level: Level | null;
  polygon: GeoJSON.Polygon;
  /** 기준 줌(z9) 월드 픽셀 경계 상자 [x0, y0, x1, y1] (화면 밖 셀 건너뛰기용) */
  box: [number, number, number, number];
}

const UNIT: View = { k: 1, x: 0, y: 0 };

/** 셀 형상과 경계 상자를 한 번만 만든다 */
export function prepareCells(cells: Iterable<CellScore>): PreparedCell[] {
  const out: PreparedCell[] = [];
  for (const c of cells) {
    const polygon = cellPolygon(c.h3);
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lng, lat] of polygon.coordinates[0]) {
      const [x, y] = lngLatToScreen(UNIT, lng, lat);
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
    out.push({ h3: c.h3, level: c.level, polygon, box });
  }
  return out;
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const cellFillColor = (lv: Level) => rgba(RISK_COLOR[lv], CELL_FILL_OPACITY);

/** 데이터 부족 빗금: 회색 바탕(불투명도 0.5) 위에 진한 회색 사선 */
export function makeHatchPattern(ctx: CanvasRenderingContext2D, size = 6): CanvasPattern | null {
  const c = ctx.canvas.ownerDocument.createElement('canvas');
  c.width = c.height = size;
  const p = c.getContext('2d');
  if (!p) return null;
  p.fillStyle = rgba(NO_DATA_COLOR, CELL_FILL_OPACITY);
  p.fillRect(0, 0, size, size);
  p.strokeStyle = NO_DATA_HATCH_COLOR;
  p.lineWidth = 1;
  p.beginPath();
  // 타일 경계에서 이어지도록 모서리까지 세 줄
  for (const o of [-size, 0, size]) {
    p.moveTo(o, size);
    p.lineTo(o + size, 0);
  }
  p.stroke();
  return ctx.createPattern(c, 'repeat');
}

/** 선택한 셀 위 숫자 태그(등급). 색은 canvas라 CSS 변수 값을 받아 쓴다 */
export interface CellTag {
  text: string;
  ink: string;
  white: string;
  font: string;
}

export interface DrawOptions {
  width: number;
  height: number;
  dpr: number;
  hatch: CanvasPattern | null;
  selected?: string | null;
  tag?: CellTag | null;
  /** 주면 이 셀들만 그대로 칠하고 나머지는 DIM_FILL_OPACITY로 흐리게(코스 화면) */
  dim?: ReadonlySet<string> | null;
}

/** 숫자 태그 반지름과 셀 꼭대기에서 띄우는 거리(CSS px) */
export const TAG_RADIUS = 10;
export const TAG_GAP = 4;

/** 셀 꼭대기 위에 검정 원 + 흰 테두리 + 흰 숫자. 글자에 흰 후광을 두르지 않는다 */
function drawTag(ctx: CanvasRenderingContext2D, view: View, cell: PreparedCell, tag: CellTag) {
  let top: [number, number] = [0, Infinity];
  for (const [lng, lat] of cell.polygon.coordinates[0]) {
    const p = lngLatToScreen(view, lng, lat);
    if (p[1] < top[1]) top = p;
  }
  const [cx] = lngLatToScreen(view, ...cellCenter(cell.h3));
  const cy = top[1] - TAG_GAP - TAG_RADIUS;
  ctx.beginPath();
  ctx.arc(cx, cy, TAG_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = tag.ink;
  ctx.fill();
  ctx.strokeStyle = tag.white;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = tag.white;
  ctx.font = `700 12px ${tag.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag.text, cx, cy + 0.5);
}

/** 셀을 화면 좌표로 그린다. 변환에는 기기 배율만 넣어 선 두께가 화면 기준이 된다 */
export function drawCells(
  ctx: CanvasRenderingContext2D,
  cells: PreparedCell[],
  view: View,
  { width, height, dpr, hatch, selected, tag, dim }: DrawOptions,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const path = geoPath(viewProjection(view), ctx);

  const visible = cells.filter(({ box: [x0, y0, x1, y1] }) => {
    const l = x0 * view.k + view.x;
    const t = y0 * view.k + view.y;
    const r = x1 * view.k + view.x;
    const b = y1 * view.k + view.y;
    return r >= 0 && b >= 0 && l <= width && t <= height;
  });
  if (visible.length === 0) return;

  // 등급과 흐림 여부로 묶어 한 번씩 칠한다
  const groups = new Map<string, { lv: Level | null; dimmed: boolean; cells: PreparedCell[] }>();
  for (const c of visible) {
    const dimmed = dim ? !dim.has(c.h3) : false;
    const key = `${c.level}:${dimmed}`;
    const g = groups.get(key);
    if (g) g.cells.push(c);
    else groups.set(key, { lv: c.level, dimmed, cells: [c] });
  }
  for (const { lv, dimmed, cells: group } of groups.values()) {
    ctx.beginPath();
    for (const c of group) path(c.polygon);
    ctx.fillStyle =
      lv === null ? (hatch ?? rgba(NO_DATA_COLOR, CELL_FILL_OPACITY)) : cellFillColor(lv);
    ctx.globalAlpha = dimmed ? DIM_FILL_OPACITY / CELL_FILL_OPACITY : 1;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.beginPath();
  for (const c of visible) path(c.polygon);
  ctx.strokeStyle = CELL_STROKE_COLOR;
  ctx.lineWidth = CELL_STROKE_WIDTH;
  ctx.stroke();

  const sel = selected ? visible.find((c) => c.h3 === selected) : undefined;
  if (sel) {
    ctx.beginPath();
    path(sel.polygon);
    ctx.strokeStyle = SELECTED_STROKE_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (tag) drawTag(ctx, view, sel, tag);
  }
}
