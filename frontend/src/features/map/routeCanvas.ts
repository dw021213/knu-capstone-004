import type { Level } from '../../entities/risk/level';
import {
  RISK_COLOR,
  ROUTE_HIGHLIGHT_OUTLINE,
  ROUTE_HIGHLIGHT_OUTLINE_WIDTH,
  ROUTE_HIGHLIGHT_UNDER_WIDTH,
  ROUTE_HIGHLIGHT_WIDTH,
  ROUTE_NO_DATA_COLOR,
  ROUTE_NO_DATA_DASH,
  ROUTE_UNDER_WIDTH,
  ROUTE_WIDTH,
} from '../../entities/risk/colors';
import { lngLatToScreen, type View } from './view';

type RouteLine = { coords: [number, number][]; level: Level | null };

/** 지도에 그릴 코스 경로. lines는 코스 순서의 구간(앞 구간 끝점 = 다음 구간 첫 점) */
export interface MapRoute {
  lines: RouteLine[];
  /** 굵게 강조할 구간(목록에서 고른 주의할 구간 묶음) */
  highlight?: RouteLine[] | null;
  /** false면 시작·끝 표지를 그리지 않는다(장소 번호 핀이 끝점을 대신할 때) */
  ends?: boolean;
}

/** canvas라 CSS 변수 값을 받아 쓴다 */
export interface RouteStyle {
  white: string;
  ink: string;
  font: string;
}

export interface RouteMarkHit {
  x: number;
  y: number;
  label: string;
}

/** 그린 시작·끝 표지와 강조한 구간 가운데의 화면 위치 */
export interface RouteHits {
  ends: RouteMarkHit[];
  highlight: { x: number; y: number } | null;
}

/**
 * 시작·끝 표지: 경로 끝점에 검정 점, 그 위에 검정 알약 + 흰 테두리 + 흰 글자(흰 후광 글자를 쓰지 않는다).
 * 알약이 첫·마지막 구간 색을 가리지 않게 점 위로 띄운다
 */
const END_H = 20;
const END_PAD = 6;
const END_CHAR = 12;
const END_DOT = 4;
const END_LIFT = 23;

function drawEnd(
  ctx: CanvasRenderingContext2D,
  [x, y]: [number, number],
  label: string,
  style: RouteStyle,
) {
  ctx.beginPath();
  ctx.arc(x, y, END_DOT, 0, Math.PI * 2);
  ctx.fillStyle = style.ink;
  ctx.fill();
  ctx.strokeStyle = style.white;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const w = END_CHAR * label.length + END_PAD * 2;
  const cy = y - END_LIFT;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, cy - END_H / 2, w, END_H, END_H / 2);
  ctx.fillStyle = style.ink;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = style.white;
  ctx.font = `700 12px ${style.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, cy + 0.5);
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

function strokeLines(ctx: CanvasRenderingContext2D, view: View, lines: RouteLine[], width: number) {
  for (const l of lines) {
    ctx.beginPath();
    trace(ctx, view, l.coords, true);
    ctx.setLineDash(l.level === null ? ROUTE_NO_DATA_DASH : []);
    ctx.strokeStyle = l.level === null ? ROUTE_NO_DATA_COLOR : RISK_COLOR[l.level];
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function underline(
  ctx: CanvasRenderingContext2D,
  view: View,
  lines: RouteLine[],
  color: string,
  width: number,
) {
  ctx.beginPath();
  lines.forEach((l, i) => trace(ctx, view, l.coords, i === 0));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * 셀 위에 코스를 그린다(변환은 drawCells가 넣은 기기 배율 그대로).
 * 흰 밑선 → 구간 등급 색 선(데이터 부족은 회색 점선) → 고른 구간이 있으면 검정 테두리 + 굵은 색 선 →
 * 시작·끝 표지. 코스 위에 번호 표지는 찍지 않는다(멘토 회의: 선 색만 보고 더 유의할 곳을 안다)
 */
export function drawRoute(
  ctx: CanvasRenderingContext2D,
  route: MapRoute,
  view: View,
  style: RouteStyle,
): RouteHits {
  if (route.lines.length === 0) return { ends: [], highlight: null };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  underline(ctx, view, route.lines, style.white, ROUTE_UNDER_WIDTH);
  strokeLines(ctx, view, route.lines, ROUTE_WIDTH);

  let highlight: RouteHits['highlight'] = null;
  const hl = route.highlight;
  if (hl && hl.length > 0) {
    underline(ctx, view, hl, ROUTE_HIGHLIGHT_OUTLINE, ROUTE_HIGHLIGHT_OUTLINE_WIDTH);
    underline(ctx, view, hl, style.white, ROUTE_HIGHLIGHT_UNDER_WIDTH);
    strokeLines(ctx, view, hl, ROUTE_HIGHLIGHT_WIDTH);
    const pts = hl.flatMap((l) => l.coords);
    const [x, y] = lngLatToScreen(view, ...pts[Math.floor((pts.length - 1) / 2)]);
    highlight = { x, y };
  }

  if (route.ends === false) return { ends: [], highlight };
  const first = route.lines[0].coords[0];
  const lastLine = route.lines[route.lines.length - 1].coords;
  const last = lastLine[lastLine.length - 1];
  const ends: RouteMarkHit[] = [];
  for (const [lngLat, label] of [
    [first, '시작'],
    [last, '끝'],
  ] as const) {
    const [x, y] = lngLatToScreen(view, ...lngLat);
    drawEnd(ctx, [x, y], label, style);
    ends.push({ x, y, label });
  }
  return { ends, highlight };
}
