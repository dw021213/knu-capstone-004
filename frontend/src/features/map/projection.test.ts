import { describe, it, expect } from 'vitest';
import { tilePixel, makeWorldProjection } from './projection';

const PTS: [string, number, number][] = [
  ['제주공항', 126.493, 33.5113],
  ['성산일출봉', 126.9425, 33.459],
  ['우도', 126.953, 33.506],
];

describe('투영 = 슬리피 타일 공식', () => {
  for (const z of [9, 10, 11, 12, 13, 14, 15]) {
    for (const [n, lng, lat] of PTS) {
      it(`${n} z${z}`, () => {
        const [px, py] = tilePixel(lng, lat, z);
        const [x, y] = makeWorldProjection(z)([lng, lat])!;
        expect(Math.abs(x - px)).toBeLessThan(1);
        expect(Math.abs(y - py)).toBeLessThan(1);
      });
    }
  }
});
