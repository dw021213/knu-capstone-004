import { describe, it, expect } from 'vitest';
import { levelFromPercentile, LEVEL_NAME } from './level';

describe('levelFromPercentile', () => {
  it.each([
    [null, null],
    [Number.NaN, null],
    [0, 1],
    [9.99, 1],
    [10, 2],
    [29.99, 2],
    [30, 3],
    [69.99, 3],
    [70, 4],
    [89.99, 4],
    [90, 5],
    [100, 5],
  ])('%s → %s', (p, lv) => expect(levelFromPercentile(p as number | null)).toBe(lv));

  it('등급 이름', () => {
    expect(LEVEL_NAME).toEqual({ 1: '매우 낮음', 2: '낮음', 3: '보통', 4: '높음', 5: '매우 높음' });
  });
});
