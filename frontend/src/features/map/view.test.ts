// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zoom, zoomIdentity } from 'd3';
import { cellCenter, cellPolygon } from '../../shared/geo/h3';
import {
  lngLatToScreen,
  screenToLngLat,
  viewProjection,
  zoomLevel,
  fitView,
  focusView,
  homeView,
  constrainView,
  worldExtent,
  ISLAND_CENTER,
} from './view';
import { cellAtScreen } from './hitTest';
import { JEJU_BOUNDS } from './projection';

const scores = JSON.parse(
  readFileSync(new URL('../../../public/data/scores.json', import.meta.url), 'utf8'),
) as { cells: Record<string, unknown> };
const ids = Object.keys(scores.cells);
const known = new Set(ids);
const sample = ids.filter((_, i) => i % 97 === 0);

// d3-zoom이 휠·핀치에서 하는 것과 같은 '한 점을 고정한 확대'
const before = zoomIdentity.translate(-120, -340).scale(1.15);
const p: [number, number] = [195, 422];
const after = zoomIdentity
  .translate(p[0] - (p[0] - before.x) * 8, p[1] - (p[1] - before.y) * 8)
  .scale(before.k * 8);
// 위 식이 화면 점 p를 고정하는지 먼저 확인
const fixed = before.invert(p);
const fixedAfter = after.invert(p);

describe('확대 전후 셀이 같은 위경도에 머문다 (U3-5)', () => {
  it('확대 변환이 화면 점을 고정한다', () => {
    expect(fixedAfter[0]).toBeCloseTo(fixed[0], 9);
    expect(fixedAfter[1]).toBeCloseTo(fixed[1], 9);
    expect(zoomLevel(after) - zoomLevel(before)).toBeCloseTo(3, 9);
  });

  it('셀 중심을 화면으로 보냈다 되돌린 위경도가 확대 전후 1e-6 이내로 같다', () => {
    for (const h of sample) {
      const c = cellCenter(h);
      const a = screenToLngLat(before, lngLatToScreen(before, c[0], c[1]));
      const b = screenToLngLat(after, lngLatToScreen(after, c[0], c[1]));
      expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-6);
      expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-6);
      expect(Math.abs(a[0] - c[0])).toBeLessThan(1e-6);
      expect(Math.abs(a[1] - c[1])).toBeLessThan(1e-6);
      expect(cellAtScreen(after, lngLatToScreen(after, c[0], c[1]), known)).toBe(h);
    }
  });

  it('canvas가 쓰는 투영도 같은 화면 좌표를 내고, 거꾸로 같은 꼭짓점 위경도로 돌아온다', () => {
    for (const h of sample) {
      for (const [lng, lat] of cellPolygon(h).coordinates[0]) {
        for (const v of [before, after]) {
          const [x, y] = viewProjection(v)([lng, lat])!;
          const [sx, sy] = lngLatToScreen(v, lng, lat);
          expect(Math.abs(x - sx)).toBeLessThan(1e-6);
          expect(Math.abs(y - sy)).toBeLessThan(1e-6);
          const back = viewProjection(v).invert!([x, y])!;
          expect(Math.abs(back[0] - lng)).toBeLessThan(1e-6);
          expect(Math.abs(back[1] - lat)).toBeLessThan(1e-6);
        }
      }
    }
  });
});

describe('fitView', () => {
  it('제주 본섬이 390×844 화면 안에 들어오고 z9 이상', () => {
    const v = fitView(390, 844);
    expect(zoomLevel(v)).toBeGreaterThanOrEqual(9);
    for (const [lng, lat] of [
      [126.16, 33.2],
      [126.95, 33.46],
      [126.53, 33.38],
    ]) {
      const [x, y] = lngLatToScreen(v, lng, lat);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(390);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(844);
    }
  });

  it('데스크톱(1440×900)에서는 더 확대된다', () => {
    expect(zoomLevel(fitView(1440, 900))).toBeGreaterThan(zoomLevel(fitView(390, 844)));
  });

  it('JEJU_BOUNDS는 추자도까지 넣은 값(북쪽 34.05)', () => {
    expect(JEJU_BOUNDS).toEqual({ west: 125.9, east: 127.2, south: 32.9, north: 34.05 });
  });

  it('점수 격자의 모든 셀 중심이 JEJU_BOUNDS 안이다(이동 경계 밖 셀이 없다)', () => {
    const outside = ids.filter((h) => {
      const [lng, lat] = cellCenter(h);
      const b = JEJU_BOUNDS;
      return lng < b.west || lng > b.east || lat < b.south || lat > b.north;
    });
    expect(outside).toEqual([]);
  });
});

describe('focusView', () => {
  const small = { west: 126.52, south: 33.5, east: 126.53, north: 33.51 };
  const big = { west: 126.25, south: 33.35, east: 126.5, north: 33.5 };

  it('점을 가로 가운데, 세로 anchorY 위치에 둔다', () => {
    const v = focusView(390, 844, big, [126.33, 33.46]);
    const [x, y] = lngLatToScreen(v, 126.33, 33.46);
    expect(x).toBeCloseTo(195, 6);
    expect(y).toBeCloseTo(844 * 0.4, 6);
  });

  it('경계 상자에 맞춘 줌을 12~14로 자른다', () => {
    expect(zoomLevel(focusView(390, 844, big, [126.33, 33.46]))).toBeCloseTo(12, 6);
    expect(zoomLevel(focusView(390, 844, small, [126.525, 33.505]))).toBeCloseTo(14, 6);
    const mid = { west: 126.5, south: 33.45, east: 126.56, north: 33.5 };
    const z = zoomLevel(focusView(390, 844, mid, [126.53, 33.47]));
    expect(z).toBeGreaterThan(12);
    expect(z).toBeLessThan(14);
  });
});

describe('homeView: 첫 화면은 본섬 중심을 위·아래 가림 사이 영역 가운데에 둔다', () => {
  const cases = [
    { w: 390, h: 844, top: 105, bottom: 111 },
    { w: 1440, h: 900, top: 105, bottom: 119 },
  ];
  it.each(cases)('$w×$h', ({ w, h, top, bottom }) => {
    const v = homeView(w, h, { top, bottom });
    const [, y] = lngLatToScreen(v, ...ISLAND_CENTER);
    expect(y).toBeCloseTo(top + (h - top - bottom) / 2, 6);
    // 본섬 해안(서쪽 끝, 동쪽 성산, 남쪽 끝, 북쪽 끝)이 가림 사이 영역 안
    for (const [lng, lat] of [
      [126.16, 33.3],
      [126.94, 33.46],
      [126.3, 33.2],
      [126.53, 33.56],
    ] as const) {
      const [px, py] = lngLatToScreen(v, lng, lat);
      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThanOrEqual(w);
      expect(py).toBeGreaterThanOrEqual(top);
      expect(py).toBeLessThanOrEqual(h - bottom);
    }
  });

  it('넓은 화면은 이동 경계 가로폭이 화면을 덮을 만큼 확대한다(끌면 경계에서 멈춘다)', () => {
    const v = homeView(1440, 900, { top: 105, bottom: 119 });
    const [[x0], [x1]] = worldExtent(JEJU_BOUNDS);
    expect((x1 - x0) * v.k).toBeGreaterThanOrEqual(1440 - 1e-6);
  });

  it('가림이 없으면 화면 가운데', () => {
    const v = homeView(390, 844);
    const [x, y] = lngLatToScreen(v, ...ISLAND_CENTER);
    expect(x).toBeCloseTo(195, 6);
    expect(y).toBeCloseTo(422, 6);
  });
});

describe('constrainView: 이동 경계 제한', () => {
  const ext = worldExtent(JEJU_BOUNDS);
  const d3Default = zoom().constrain();

  it('경계가 화면보다 크면 d3 기본 제한과 같다', () => {
    const extent: [[number, number], [number, number]] = [
      [0, 0],
      [1440, 900],
    ];
    for (const t of [
      zoomIdentity.translate(-200000, -100000).scale(4),
      zoomIdentity.translate(-200500, -100700).scale(4),
      zoomIdentity.translate(0, 0).scale(4),
      zoomIdentity.translate(-1e7, -1e7).scale(4),
    ]) {
      const a = constrainView(t, extent, ext);
      const b = d3Default(t, extent, ext);
      expect(a.k).toBe(b.k);
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
  });

  it('경계가 화면보다 작은 축은 가운데로 끌지 않고, 경계가 화면 안에 다 들면 그대로 둔다', () => {
    const extent: [[number, number], [number, number]] = [
      [0, 0],
      [390, 844],
    ];
    const v = homeView(390, 844, { top: 105, bottom: 111 });
    const t = zoomIdentity.translate(v.x, v.y).scale(v.k);
    const out = constrainView(t, extent, ext);
    expect(out.y).toBeCloseTo(t.y, 6);
    // d3 기본은 세로를 가운데로 옮긴다(이 동작을 피하려는 것)
    expect(Math.abs(d3Default(t, extent, ext).y - t.y)).toBeGreaterThan(10);
  });

  it('경계가 화면보다 작은 축에서 경계가 화면 밖으로 나가면 화면 끝까지만 민다', () => {
    const extent: [[number, number], [number, number]] = [
      [0, 0],
      [390, 844],
    ];
    const k = 1.1;
    const [[, y0], [, y1]] = ext;
    // 경계 위쪽이 화면 위로 50px 나간 변환 → 경계 위쪽이 화면 위 끝(0)에 온다
    const up = constrainView(zoomIdentity.translate(-x0Of(k), -y0 * k - 50).scale(k), extent, ext);
    expect(y0 * up.k + up.y).toBeCloseTo(0, 6);
    // 경계 아래쪽이 화면 아래로 나간 변환 → 경계 아래쪽이 화면 아래 끝(844)에 온다
    const down = constrainView(
      zoomIdentity.translate(-x0Of(k), 844 - y1 * k + 50).scale(k),
      extent,
      ext,
    );
    expect(y1 * down.k + down.y).toBeCloseTo(844, 6);
  });

  function x0Of(k: number) {
    return ext[0][0] * k + 10;
  }
});
