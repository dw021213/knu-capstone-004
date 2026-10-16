// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { visibleTiles, tileUrl } from './tiles';
import { lngLatToScreen, worldExtent, type View } from './view';
import { TILE, tilePixel } from './projection';

const W = 390;
const H = 844;
/** (lng, lat)을 화면 가운데에 둔 배율 k의 변환. 기본은 제주 중심 */
function centered(k: number, lng = 126.53, lat = 33.38): View {
  const [[x0, y0], [x1, y1]] = worldExtent({ west: lng, east: lng, south: lat, north: lat });
  return { k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k };
}

describe('visibleTiles', () => {
  it('k=1, 390×844, 제주 중심: 모두 z9이고 화면을 덮는다', () => {
    const tiles = visibleTiles(centered(1), W, H);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.z === 9)).toBe(true);
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.left + t.size))).toBeGreaterThanOrEqual(W);
    expect(Math.max(...tiles.map((t) => t.top + t.size))).toBeGreaterThanOrEqual(H);
    expect(tiles.every((t) => t.size === TILE)).toBe(true);
  });

  it('정수 줌은 round(9 + log2 k)', () => {
    expect(visibleTiles(centered(2 ** 1.4), W, H)[0].z).toBe(10);
    expect(visibleTiles(centered(2 ** 1.6), W, H)[0].z).toBe(11);
    expect(visibleTiles(centered(2 ** 7), W, H)[0].z).toBe(16);
  });

  it.each([1, 2 ** 1.6, 2 ** 4.3])('제주공항이 든 타일의 화면 위치가 투영과 맞는다 (k=%s)', (k) => {
    const v = centered(k, 126.5, 33.5);
    const tiles = visibleTiles(v, W, H);
    const z = tiles[0].z;
    const [px, py] = tilePixel(126.493, 33.5113, z);
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    const t = tiles.find((c) => c.x === tx && c.y === ty);
    expect(t).toBeDefined();
    const [sx, sy] = lngLatToScreen(v, 126.493, 33.5113);
    expect(Math.abs(t!.left + ((px - tx * TILE) / TILE) * t!.size - sx)).toBeLessThan(0.5);
    expect(Math.abs(t!.top + ((py - ty * TILE) / TILE) * t!.size - sy)).toBeLessThan(0.5);
  });
});

describe('tileUrl', () => {
  it('CARTO Voyager @2x, 하위 도메인 a~d', () => {
    expect(tileUrl({ x: 437, y: 203, z: 9 })).toMatch(
      /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/rastertiles\/voyager\/9\/437\/203@2x\.png$/,
    );
  });
});
