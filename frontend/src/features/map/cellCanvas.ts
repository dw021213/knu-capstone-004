import { geoPath } from 'd3';
import type { CellScore } from '../../data/types';
import type { Level } from '../../entities/risk/level';
import {
  CELL_FILL_OPACITY,
  CELL_STROKE_COLOR,
  CELL_STROKE_WIDTH,
  NO_DATA_COLOR,
  NO_DATA_HATCH_COLOR,
  RISK_COLOR,
  SELECTED_STROKE_COLOR,
} from '../../entities/risk/colors';
import { cellPolygon } from '../../shared/geo/h3';
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

export interface DrawOptions {
  width: number;
  height: number;
  dpr: number;
  hatch: CanvasPattern | null;
  selected?: string | null;
}

/** 셀을 화면 좌표로 그린다. 변환에는 기기 배율만 넣어 선 두께가 화면 기준이 된다 */
export function drawCells(
  ctx: CanvasRenderingContext2D,
  cells: PreparedCell[],
  view: View,
  { width, height, dpr, hatch, selected }: DrawOptions,
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

  const groups = new Map<Level | null, PreparedCell[]>();
  for (const c of visible) {
    const g = groups.get(c.level);
    if (g) g.push(c);
    else groups.set(c.level, [c]);
  }
  for (const [lv, group] of groups) {
    ctx.beginPath();
    for (const c of group) path(c.polygon);
    ctx.fillStyle =
      lv === null ? (hatch ?? rgba(NO_DATA_COLOR, CELL_FILL_OPACITY)) : cellFillColor(lv);
    ctx.fill();
  }

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
  }
}
