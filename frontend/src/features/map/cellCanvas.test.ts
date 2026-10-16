// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { latLngToCell, gridDisk } from 'h3-js';
import { toCellScore } from '../../data/snapshot';
import {
  RISK_COLOR,
  CELL_FILL_OPACITY,
  CELL_STROKE_COLOR,
  CELL_STROKE_WIDTH,
  DIM_FILL_OPACITY,
} from '../../entities/risk/colors';
import { cellFillColor, drawCells, prepareCells } from './cellCanvas';
import { fitView, lngLatToScreen } from './view';
import { cellCenter } from '../../shared/geo/h3';

type Op = {
  op: string;
  fillStyle?: unknown;
  strokeStyle?: unknown;
  lineWidth?: number;
  args?: number[];
  text?: string;
  font?: string;
  globalAlpha?: number;
};

/** 그리기 호출을 기록하는 가짜 2D 컨텍스트 */
function recorder() {
  const ops: Op[] = [];
  let pathPoints = 0;
  const ctx = {
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillText: (text: string, ...args: number[]) =>
      ops.push({ op: 'fillText', text, args, fillStyle: ctx.fillStyle, font: ctx.font }),
    setTransform: (...args: number[]) => ops.push({ op: 'setTransform', args }),
    clearRect: (...args: number[]) => ops.push({ op: 'clearRect', args }),
    beginPath: () => {
      pathPoints = 0;
    },
    moveTo: () => void pathPoints++,
    lineTo: () => void pathPoints++,
    closePath: () => {},
    arc: () => {},
    fill: () =>
      ops.push({
        op: 'fill',
        fillStyle: ctx.fillStyle,
        globalAlpha: ctx.globalAlpha,
        args: [pathPoints],
      }),
    stroke: () =>
      ops.push({
        op: 'stroke',
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
        args: [pathPoints],
      }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const airport = latLngToCell(33.5113, 126.493, 8);
const ring = gridDisk(airport, 1);
const scores = [
  toCellScore(ring[0], null, 'none'),
  toCellScore(ring[1], 75, 'standard_link'),
  toCellScore(ring[2], 95, 'standard_link'),
  toCellScore(ring[3], 5, 'ngii_map'),
];
const HATCH = { hatch: true } as unknown as CanvasPattern;

describe('cellFillColor', () => {
  it.each([1, 2, 3, 4, 5] as const)('등급 %s 램프 색을 불투명도 0.5로', (lv) => {
    const hex = RISK_COLOR[lv];
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(cellFillColor(lv)).toBe(`rgba(${r}, ${g}, ${b}, 0.5)`);
  });
});

describe('drawCells', () => {
  const view = fitView(390, 844);
  const cells = prepareCells(scores);

  it('등급 셀은 램프 색, 데이터 부족 셀은 빗금 패턴으로 칠하고 흰 0.5px 선을 긋는다', () => {
    const { ctx, ops } = recorder();
    drawCells(ctx, cells, view, { width: 390, height: 844, dpr: 2, hatch: HATCH });
    const fills = ops.filter((o) => o.op === 'fill');
    expect(fills.map((f) => f.fillStyle)).toEqual(
      expect.arrayContaining([cellFillColor(4), cellFillColor(5), cellFillColor(1), HATCH]),
    );
    expect(fills.every((f) => f.args![0] > 0)).toBe(true);
    const strokes = ops.filter((o) => o.op === 'stroke');
    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toMatchObject({
      strokeStyle: CELL_STROKE_COLOR,
      lineWidth: CELL_STROKE_WIDTH,
    });
    expect(CELL_STROKE_WIDTH).toBe(0.5);
  });

  it('선 두께가 화면 기준이 되도록 기기 배율만 변환에 넣는다', () => {
    const { ctx, ops } = recorder();
    // 공항 셀을 화면 가운데에 두고 16배 확대
    const k = view.k * 16;
    const [ax, ay] = lngLatToScreen({ k, x: 0, y: 0 }, ...cellCenter(airport));
    drawCells(
      ctx,
      cells,
      { k, x: 195 - ax, y: 422 - ay },
      { width: 390, height: 844, dpr: 2, hatch: HATCH },
    );
    expect(ops.find((o) => o.op === 'setTransform')!.args).toEqual([2, 0, 0, 2, 0, 0]);
    expect(ops.find((o) => o.op === 'stroke')!.lineWidth).toBe(0.5);
  });

  it('화면 밖 셀은 건너뛴다', () => {
    const { ctx, ops } = recorder();
    const [sx, sy] = lngLatToScreen(view, ...cellCenter(airport));
    // 공항 셀이 화면 밖으로 나가도록 크게 옮긴다
    const far = { k: view.k, x: view.x - sx - 5000, y: view.y - sy - 5000 };
    drawCells(ctx, cells, far, { width: 390, height: 844, dpr: 1, hatch: HATCH });
    expect(ops.filter((o) => o.op === 'fill')).toHaveLength(0);
  });

  it('선택한 셀은 따로 굵은 선을 긋는다', () => {
    const { ctx, ops } = recorder();
    drawCells(ctx, cells, view, {
      width: 390,
      height: 844,
      dpr: 1,
      hatch: HATCH,
      selected: ring[1],
    });
    const strokes = ops.filter((o) => o.op === 'stroke');
    expect(strokes).toHaveLength(2);
    expect(strokes[1].lineWidth).toBeGreaterThan(1);
  });

  it('선택한 셀 위에 검정 바탕 흰 숫자 태그를 그린다(색각 이상 사용자용)', () => {
    const { ctx, ops } = recorder();
    drawCells(ctx, cells, view, {
      width: 390,
      height: 844,
      dpr: 1,
      hatch: HATCH,
      selected: ring[2],
      tag: { text: '5', ink: '#111111', white: '#ffffff', font: 'Noto Sans KR' },
    });
    const text = ops.filter((o) => o.op === 'fillText');
    expect(text).toHaveLength(1);
    expect(text[0]).toMatchObject({ text: '5', fillStyle: '#ffffff' });
    expect(text[0].font).toContain('Noto Sans KR');
    // 글자 바로 앞에 검정 바탕을 칠한다
    const i = ops.indexOf(text[0]);
    const chip = ops
      .slice(0, i)
      .filter((o) => o.op === 'fill')
      .at(-1)!;
    expect(chip.fillStyle).toBe('#111111');
    // 태그는 셀 중심보다 위(셀 색을 가리지 않게)
    const [, cy] = lngLatToScreen(view, ...cellCenter(ring[2]));
    expect(text[0].args![1]).toBeLessThan(cy);
  });

  it('태그를 주지 않거나 선택한 셀이 화면 밖이면 숫자를 그리지 않는다', () => {
    const tag = { text: '5', ink: '#111111', white: '#ffffff', font: 'x' };
    let r = recorder();
    drawCells(r.ctx, cells, view, {
      width: 390,
      height: 844,
      dpr: 1,
      hatch: HATCH,
      selected: ring[2],
    });
    expect(r.ops.filter((o) => o.op === 'fillText')).toHaveLength(0);
    r = recorder();
    const [sx, sy] = lngLatToScreen(view, ...cellCenter(airport));
    const far = { k: view.k, x: view.x - sx - 5000, y: view.y - sy - 5000 };
    drawCells(r.ctx, cells, far, {
      width: 390,
      height: 844,
      dpr: 1,
      hatch: HATCH,
      selected: ring[2],
      tag,
    });
    expect(r.ops.filter((o) => o.op === 'fillText')).toHaveLength(0);
  });

  it('dim을 주면 그 밖의 셀은 채움 불투명도 0.15로 흐리게, 안의 셀은 그대로 칠한다', () => {
    const { ctx, ops } = recorder();
    drawCells(ctx, cells, view, {
      width: 390,
      height: 844,
      dpr: 1,
      hatch: HATCH,
      dim: new Set([ring[1]]),
    });
    const fills = ops.filter((o) => o.op === 'fill');
    const kept = fills.filter((f) => f.globalAlpha === 1);
    expect(kept.map((f) => f.fillStyle)).toEqual([cellFillColor(4)]);
    const dimmed = fills.filter((f) => f.globalAlpha !== 1);
    expect(dimmed.length).toBeGreaterThan(0);
    for (const f of dimmed)
      expect(f.globalAlpha! * CELL_FILL_OPACITY).toBeCloseTo(DIM_FILL_OPACITY, 6);
    expect(DIM_FILL_OPACITY).toBe(0.15);
    // 다음 그리기에 흐림이 남지 않는다
    expect(ctx.globalAlpha).toBe(1);
  });
});
