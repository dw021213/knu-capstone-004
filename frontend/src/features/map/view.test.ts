// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zoomIdentity } from 'd3';
import { cellCenter, cellPolygon } from '../../shared/geo/h3';
import { lngLatToScreen, screenToLngLat, viewProjection, zoomLevel, fitView } from './view';
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
