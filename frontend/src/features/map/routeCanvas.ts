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
  ink: string;
  font: string;
}

export interface RouteMarkHit {
  x: number;
  y: number;
  label: string;
}

/** 그린 주의 지점과 시작·끝 표지의 화면 위치 */
export interface RouteHits {
  marks: RouteMarkHit[];
  ends: RouteMarkHit[];
}

/**
 * 시작·끝 표지: 경로 끝점에 검정 점, 그 위에 검정 알약 + 흰 테두리 + 흰 글자(흰 후광 글자를 쓰지 않는다).
 * 첫·마지막 구간이 주의 구간이어도 빨간 점에 가리지 않게 알약을 점 위로 띄운다
 */
const END_H = 20;
const END_PAD = 6;
const END_CHAR = 12;
const END_DOT = 4;
const END_LIFT = CAUTION_MARK_RADIUS + END_H / 2 + 2;

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

/**
 * 셀 위에 코스를 그린다(변환은 drawCells가 넣은 기기 배율 그대로).
 * 흰 밑선 → 구간 등급 색 선(데이터 부족은 회색 점선) → 주의 지점 빨간 원과 흰 번호 → 시작·끝 표지
 */
export function drawRoute(
  ctx: CanvasRenderingContext2D,
  route: MapRoute,
  view: View,
  style: RouteStyle,
): RouteHits {
  if (route.lines.length === 0) return { marks: [], ends: [] };
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
  return { marks: hits, ends };
}
