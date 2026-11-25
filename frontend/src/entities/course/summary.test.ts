// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Course } from '../../data/types';
import type { Level } from '../risk/level';
import type { Segment } from './segments';
import { cautionCount, kmRange, noDataLine, placeRange, summarize } from './summary';

const seg = (index: number, level: Level | null, startKm: number, endKm: number): Segment => ({
  index,
  h3: `h${index}`,
  level,
  startKm,
  endKm,
  coords: [],
});
const course = (id: string, lengthKm = 10): Course => ({ id, name: id, lengthKm, coords: [] });

describe('summarize', () => {
  it('주의할 구간 묶음과 데이터 부족 비율을 구간에서 센다', () => {
    const s = summarize(course('a'), [
      seg(0, 2, 0, 1),
      seg(1, 4, 1, 1.5),
      seg(2, null, 1.5, 3.5),
      seg(3, 5, 3.5, 3.8),
      seg(4, 1, 3.8, 4),
    ]);
    // 사이 데이터 부족 구간이 2km라 두 묶음
    expect(s.groups.map((g) => g.id)).toEqual([1, 3]);
    expect(s.noDataRatio).toBeCloseTo(0.5, 6);
    expect(s).not.toHaveProperty('level');
  });
});

describe('cautionCount', () => {
  const base = summarize(course('a'), []);
  it('묶음 수를 세고, 없으면 없다고, 모든 구간이 데이터 부족이면 없다고 하지 않는다', () => {
    const two = summarize(course('a'), [seg(0, 4, 0, 1), seg(1, 1, 1, 3), seg(2, 5, 3, 4)]);
    expect(cautionCount(two)).toBe('주의할 구간 2곳');
    expect(cautionCount(base)).toBe('주의할 구간 없음');
    expect(cautionCount({ ...base, noDataRatio: 1 })).toBe('도로 자료 미확인');
  });
});

describe('noDataLine', () => {
  it('데이터 부족 구간이 20% 이상이면 숫자 없이 한 줄', () => {
    expect(noDataLine(0.1)).toBeNull();
    expect(noDataLine(0.2)).toBe('도로 자료가 확인되지 않은 구간이 많아요');
  });
});

describe('범위 글', () => {
  it('거리: 물결 앞뒤를 띄우고, 반올림해 같으면 지점', () => {
    expect(kmRange(0, 2.21)).toBe('0.0 ~ 2.2km');
    expect(kmRange(3.21, 3.24)).toBe('3.2km 지점');
  });

  it('읍면동: 다르면 물결로 잇고 같으면 하나, 모르면 구간', () => {
    expect(placeRange('삼도2동', '건입동')).toBe('삼도2동 ~ 건입동');
    expect(placeRange('건입동', '건입동')).toBe('건입동');
    expect(placeRange(null, '건입동')).toBe('건입동');
    expect(placeRange(null, null)).toBe('구간');
  });
});
