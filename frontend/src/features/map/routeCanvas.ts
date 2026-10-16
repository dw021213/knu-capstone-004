import type { Level } from '../../entities/risk/level';
import {
  CAUTION_MARK_COLOR,
  CAUTION_MARK_RADIUS,
  RISK_COLOR,
  ROUTE_NO_DATA_COLOR,
  ROUTE_NO_DATA_DASH,
  ROUTE_UNDER_WIDTH,
  ROUTE_WIDTH,
} from '../../entities/risk/colors';
import { lngLatToScreen, type View } from './view';

/** 지도에 그릴 코스 경로. lines는 코스 순서의 구간(앞 구간 끝점 = 다음 구간 첫 점) */
export interface MapRoute {
  lines: { coords: [number, number][]; level: Level | null }[];
  /** 주의 지점(번호) */
  marks: { lngLat: [number, number]; label: string }[];
}

/** canvas라 CSS 변수 값을 받아 쓴다 */
export interface RouteStyle {
  white: string;
  font: string;
}

export interface RouteMarkHit {
  x: number;
  y: number;
  label: string;
}

function trace(
  ctx: CanvasRenderingContext2D,
  view: View,
  coords: [number, number][],
  first: boolean,
) {
  coords.forEach(([lng, lat], i) => {
    const [x, y] = lngLatToScreen(view, lng, lat);
    if (i === 0 && first) ctx.moveTo(x, y);
    else if (i > 0) ctx.lineTo(x, y);
  });
}

/**
 * 셀 위에 코스를 그린다(변환은 drawCells가 넣은 기기 배율 그대로).
 * 흰 밑선 → 구간 등급 색 선(데이터 부족은 회색 점선) → 주의 지점 빨간 원과 흰 번호
 */
export function drawRoute(
  ctx: CanvasRenderingContext2D,
  route: MapRoute,
  view: View,
  style: RouteStyle,
): RouteMarkHit[] {
  if (route.lines.length === 0) return [];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  ctx.beginPath();
  route.lines.forEach((l, i) => trace(ctx, view, l.coords, i === 0));
  ctx.strokeStyle = style.white;
  ctx.lineWidth = ROUTE_UNDER_WIDTH;
  ctx.stroke();

  for (const l of route.lines) {
    ctx.beginPath();
    trace(ctx, view, l.coords, true);
    ctx.setLineDash(l.level === null ? ROUTE_NO_DATA_DASH : []);
    ctx.strokeStyle = l.level === null ? ROUTE_NO_DATA_COLOR : RISK_COLOR[l.level];
    ctx.lineWidth = ROUTE_WIDTH;
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const hits: RouteMarkHit[] = [];
  for (const m of route.marks) {
    const [x, y] = lngLatToScreen(view, ...m.lngLat);
    ctx.beginPath();
    ctx.arc(x, y, CAUTION_MARK_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = CAUTION_MARK_COLOR;
    ctx.fill();
    ctx.strokeStyle = style.white;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = style.white;
    ctx.font = `700 12px ${style.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.label, x, y + 0.5);
    hits.push({ x, y, label: m.label });
  }
  return hits;
}
