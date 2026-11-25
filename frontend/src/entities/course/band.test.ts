// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Level } from '../risk/level';
import { bandPieces } from './band';
import type { Segment } from './segments';

const seg = (index: number, level: Level | null, startKm: number, endKm: number): Segment => ({
  index,
  h3: `h${index}`,
  level,
  startKm,
  endKm,
  coords: [],
});

describe('bandPieces', () => {
  it('구간 길이 비율로 조각을 내고 이웃한 같은 등급은 합친다', () => {
    const pieces = bandPieces([
      seg(0, 2, 0, 1),
      seg(1, 2, 1, 2),
      seg(2, 5, 2, 2.5),
      seg(3, null, 2.5, 3.5),
      seg(4, 2, 3.5, 4),
    ]);
    expect(pieces.map((p) => p.level)).toEqual([2, 5, null, 2]);
    expect(pieces.map((p) => p.share)).toEqual([0.5, 0.125, 0.25, 0.125]);
  });

  it('코스 일부(묶음)만 넣으면 그 부분 길이 기준', () => {
    const pieces = bandPieces([seg(3, 4, 10, 10.3), seg(4, 1, 10.3, 10.4), seg(5, 5, 10.4, 10.6)]);
    const shares = pieces.map((p) => p.share);
    expect(shares[0]).toBeCloseTo(0.5, 9);
    expect(shares[1]).toBeCloseTo(1 / 6, 9);
    expect(shares[2]).toBeCloseTo(1 / 3, 9);
  });

  it('구간이 없거나 길이가 0이면 조각도 없다', () => {
    expect(bandPieces([])).toEqual([]);
    expect(bandPieces([seg(0, 3, 1, 1)])).toEqual([]);
  });
});
