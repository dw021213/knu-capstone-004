// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  CAUTION_MARK_COLOR,
  CAUTION_MARK_RADIUS,
  NO_DATA_HATCH_COLOR,
  RISK_COLOR,
  ROUTE_UNDER_WIDTH,
  ROUTE_WIDTH,
} from '../../entities/risk/colors';
import { drawRoute, type MapRoute } from './routeCanvas';
import { fitView, lngLatToScreen } from './view';

type Op = {
  op: string;
  strokeStyle?: unknown;
  fillStyle?: unknown;
  lineWidth?: number;
  dash?: number[];
  points?: number;
  text?: string;
  args?: number[];
};

function recorder() {
  const ops: Op[] = [];
  let points = 0;
  let dash: number[] = [];
  const ctx = {
    strokeStyle: '' as unknown,
    fillStyle: '' as unknown,
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    setLineDash: (d: number[]) => {
      dash = d;
    },
    beginPath: () => {
      points = 0;
    },
    moveTo: () => void points++,
    lineTo: () => void points++,
    arc: (...args: number[]) => ops.push({ op: 'arc', args }),
    roundRect: (...args: number[]) => ops.push({ op: 'roundRect', args }),
    stroke: () =>
      ops.push({
        op: 'stroke',
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
        dash,
        points,
      }),
    fill: () => ops.push({ op: 'fill', fillStyle: ctx.fillStyle }),
    fillText: (text: string, ...args: number[]) =>
      ops.push({ op: 'fillText', text, fillStyle: ctx.fillStyle, args }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const view = fitView(390, 844);
const STYLE = { white: '#ffffff', ink: '#111111', font: 'Noto Sans KR' };
const route: MapRoute = {
  lines: [
    {
      level: 2,
      coords: [
        [126.5, 33.4],
        [126.51, 33.4],
      ],
    },
    {
      level: null,
      coords: [
        [126.51, 33.4],
        [126.52, 33.41],
      ],
    },
    {
      level: 5,
      coords: [
        [126.52, 33.41],
        [126.53, 33.41],
      ],
    },
  ],
  marks: [{ lngLat: [126.525, 33.41], label: '1' }],
};

describe('drawRoute', () => {
  const { ctx, ops } = recorder();
  const hits = drawRoute(ctx, route, view, STYLE);
  const markFill = ops.find((o) => o.op === 'fill' && o.fillStyle === CAUTION_MARK_COLOR);
  const strokes = ops.filter((o) => o.op === 'stroke');

  it('먼저 경로 전체에 흰 10px 밑선을 긋는다', () => {
    expect(strokes[0]).toMatchObject({ strokeStyle: '#ffffff', lineWidth: ROUTE_UNDER_WIDTH });
    expect(ROUTE_UNDER_WIDTH).toBe(10);
    // 세 구간의 점이 모두 한 줄에(이음 점은 한 번)
    expect(strokes[0].points).toBe(4);
  });

  it('구간마다 등급 색 6px 실선, 데이터 부족 구간은 회색 점선', () => {
    const lines = strokes.slice(1, 4);
    expect(lines.map((s) => s.strokeStyle)).toEqual([
      RISK_COLOR[2],
      NO_DATA_HATCH_COLOR,
      RISK_COLOR[5],
    ]);
    expect(lines.every((s) => s.lineWidth === ROUTE_WIDTH)).toBe(true);
    expect(ROUTE_WIDTH).toBe(6);
    expect(lines[0].dash).toEqual([]);
    expect(lines[1].dash!.length).toBeGreaterThan(0);
    expect(lines[2].dash).toEqual([]);
  });

  it('주의 지점은 빨간 원에 흰 번호를 찍고 화면 위치를 돌려준다', () => {
    expect(markFill).toBeDefined();
    expect(CAUTION_MARK_COLOR).toBe(RISK_COLOR[5]);
    const text = ops.find((o) => o.op === 'fillText' && o.text === '1');
    expect(text).toMatchObject({ fillStyle: '#ffffff' });
    const [x, y] = lngLatToScreen(view, 126.525, 33.41);
    expect(hits.marks).toEqual([{ x, y, label: '1' }]);
    // 점은 선 위에 그린다
    expect(ops.indexOf(markFill!)).toBeGreaterThan(ops.indexOf(strokes[3]));
  });

  it('경로 처음에 시작, 마지막에 끝 표지(검정 채움에 흰 글자)를 그리고 위치를 돌려준다', () => {
    const [sx, sy] = lngLatToScreen(view, 126.5, 33.4);
    const [ex, ey] = lngLatToScreen(view, 126.53, 33.41);
    expect(hits.ends).toEqual([
      { x: sx, y: sy, label: '시작' },
      { x: ex, y: ey, label: '끝' },
    ]);
    for (const label of ['시작', '끝']) {
      const t = ops.find((o) => o.op === 'fillText' && o.text === label)!;
      expect(t.fillStyle).toBe('#ffffff');
      // 글자 바로 앞에 검정 바탕을 칠한다(흰 후광 글자가 아니다)
      const chip = ops
        .slice(0, ops.indexOf(t))
        .filter((o) => o.op === 'fill')
        .at(-1)!;
      expect(chip.fillStyle).toBe('#111111');
    }
    // 첫 구간이 주의 구간이어도 빨간 점에 가리지 않도록 글자는 점보다 위에 띄운다
    const startLabel = ops.find((o) => o.op === 'fillText' && o.text === '시작')!;
    expect(startLabel.args![0]).toBeCloseTo(sx, 6);
    expect(sy - startLabel.args![1]).toBeGreaterThanOrEqual(CAUTION_MARK_RADIUS + 10);
    // 시작·끝은 주의 지점보다 나중에(위에) 그려 끝 근처 빨간 점에 가리지 않는다
    const startText = ops.findIndex((o) => o.op === 'fillText' && o.text === '시작');
    expect(startText).toBeGreaterThan(ops.indexOf(markFill!));
  });

  it('구간이 없으면 아무것도 그리지 않는다', () => {
    const r = recorder();
    expect(drawRoute(r.ctx, { lines: [], marks: [] }, view, STYLE)).toEqual({
      marks: [],
      ends: [],
    });
    expect(r.ops).toEqual([]);
  });
});
