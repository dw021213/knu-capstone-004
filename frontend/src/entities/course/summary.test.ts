// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Course } from '../../data/types';
import type { Level } from '../risk/level';
import type { Segment } from './segments';
import { courseLine, sortCourses, summarize, type CourseSummary } from './summary';

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
  it('코스 등급, 주의 구간 수·길이, 데이터 부족 비율을 구간에서 센다', () => {
    const s = summarize(course('a'), [
      seg(0, 2, 0, 1),
      seg(1, 4, 1, 1.5),
      seg(2, null, 1.5, 3.5),
      seg(3, 5, 3.5, 3.8),
      seg(4, 1, 3.8, 4),
    ]);
    expect(s.level).toBe(5);
    expect(s.caution.map((c) => c.index)).toEqual([1, 3]);
    expect(s.cautionKm).toBeCloseTo(0.8, 6);
    expect(s.noDataRatio).toBeCloseTo(0.5, 6);
  });
});

describe('sortCourses', () => {
  const sum = (id: string, level: Level | null, cautionKm: number): CourseSummary => ({
    course: course(id),
    segments: [],
    level,
    caution: [],
    cautionKm,
    noDataRatio: 0,
  });

  it('코스 등급이 낮은 순, 같으면 주의 구간 길이 합이 짧은 순, 등급을 모르는 코스는 맨 뒤', () => {
    const sorted = sortCourses([
      sum('unknown', null, 0),
      sum('high', 5, 0.2),
      sum('mid-long', 4, 1.2),
      sum('low', 2, 0),
      sum('mid-short', 4, 0.4),
    ]);
    expect(sorted.map((s) => s.course.id)).toEqual([
      'low',
      'mid-short',
      'mid-long',
      'high',
      'unknown',
    ]);
  });
});

describe('courseLine', () => {
  const base = { course: course('a'), segments: [], noDataRatio: 0 };
  it('주의 구간 수와 가장 위험한 구간 등급을 한 줄로', () => {
    expect(
      courseLine({ ...base, level: 4, caution: [seg(0, 4, 0, 1), seg(1, 4, 2, 3)], cautionKm: 2 }),
    ).toBe('주의 구간 2곳 · 가장 위험한 구간 4단계');
    expect(courseLine({ ...base, level: 3, caution: [], cautionKm: 0 })).toBe(
      '주의 구간 없음 · 가장 위험한 구간 3단계',
    );
    expect(courseLine({ ...base, level: null, caution: [], cautionKm: 0 })).toBe(
      '모든 구간 데이터 부족 · 등급을 정하지 못함',
    );
  });
});
