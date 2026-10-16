// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { toCellScore } from '../../data/snapshot';
import type { Course } from '../../data/types';
import type { Level } from '../risk/level';
import { cautionReason, courseReason, noDataLine, segmentRange } from './reason';
import type { Segment } from './segments';
import type { CourseSummary } from './summary';

const seg = (level: Level | null, startKm: number, endKm: number): Segment => ({
  index: 0,
  h3: 'h',
  level,
  startKm,
  endKm,
  coords: [],
});
const course: Course = { id: 'olle-1', name: '제주올레 1코스', lengthKm: 15.1, coords: [] };
const summary = (p: Partial<CourseSummary>): CourseSummary => ({
  course,
  segments: [seg(2, 0, 5), seg(4, 5, 5.4), seg(5, 5.4, 5.7), seg(1, 5.7, 15.1)],
  level: 5,
  caution: [seg(4, 5, 5.4), seg(5, 5.4, 5.7)],
  cautionKm: 0.7,
  noDataRatio: 0,
  ...p,
});

describe('courseReason', () => {
  it('평균이 아니라 가장 위험한 구간 기준임을 문장에 밝힌다', () => {
    expect(courseReason(summary({}))).toBe(
      '이 코스가 지나는 셀 구간 4개 중 가장 위험한 구간이 5단계(매우 높음)라 코스 등급을 5단계로 정했어요. ' +
        '구간 등급의 평균이 아니라 가장 위험한 구간을 기준으로 해요. ' +
        '4단계 이상인 주의 구간은 2곳, 합쳐서 0.7km예요.',
    );
  });

  it('주의 구간이 없으면 없다고 하고, 데이터 부족 구간은 위험하지 않다는 뜻이 아니라고 덧붙인다', () => {
    const text = courseReason(
      summary({
        level: 3,
        caution: [],
        cautionKm: 0,
        noDataRatio: 0.12,
        segments: [seg(3, 0, 10), seg(null, 10, 11.5)],
      }),
    );
    expect(text).toContain('가장 위험한 구간이 3단계(보통)라 코스 등급을 3단계로 정했어요.');
    expect(text).toContain('4단계 이상인 주의 구간은 없어요.');
    expect(text).toContain(
      '도로 자료가 확인되지 않은 구간(12%)은 등급 계산에서 빠졌어요. 위험하지 않다는 뜻은 아니에요.',
    );
  });

  it('모든 구간이 데이터 부족이면 등급을 정하지 못했다고 한다', () => {
    expect(courseReason(summary({ level: null, caution: [], cautionKm: 0, noDataRatio: 1 }))).toBe(
      '이 코스가 지나는 구간 모두 도로 자료가 확인되지 않아 코스 등급을 정하지 못했어요. 위험하지 않다는 뜻은 아니에요.',
    );
  });

  it('단정하는 말(확률, 안전합니다, 안전해요)을 쓰지 않는다', () => {
    for (const s of [
      summary({}),
      summary({ level: 1, caution: [], cautionKm: 0 }),
      summary({ level: null, caution: [], cautionKm: 0, noDataRatio: 1 }),
    ]) {
      expect(courseReason(s)).not.toMatch(/확률|안전합니다|안전해요/);
    }
  });
});

describe('cautionReason', () => {
  it('교통 모델 상위 비율로 이유 한 줄', () => {
    expect(cautionReason(toCellScore('h', 92.4, 'standard_link'))).toBe(
      '도로가 있는 제주 격자 중 교통사고 위험 상위 8%',
    );
    expect(cautionReason(toCellScore('h', 70, 'ngii_map'))).toBe(
      '도로가 있는 제주 격자 중 교통사고 위험 상위 30%',
    );
  });
});

describe('segmentRange', () => {
  it('소수 한 자리 km 구간, 같아지면 지점으로', () => {
    expect(segmentRange(seg(4, 3.21, 3.64))).toBe('3.2~3.6km');
    expect(segmentRange(seg(4, 3.21, 3.24))).toBe('3.2km 지점');
  });
});

describe('noDataLine', () => {
  it('데이터 부족 구간이 20% 이상일 때만 한 줄', () => {
    expect(noDataLine(0.1)).toBeNull();
    expect(noDataLine(0.2)).toBe('데이터 부족 구간 20% (도로 자료 미확인)');
    expect(noDataLine(0.456)).toBe('데이터 부족 구간 46% (도로 자료 미확인)');
  });
});
