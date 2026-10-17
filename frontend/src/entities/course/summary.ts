import type { Course } from '../../data/types';
import type { Level } from '../risk/level';
import { cautionSegments, courseLevel, type Segment } from './segments';

export interface CourseSummary {
  course: Course;
  segments: Segment[];
  /** 가장 위험한 구간 등급. 모든 구간이 데이터 부족이면 null */
  level: Level | null;
  /** 4단계 이상 구간(코스 순서) */
  caution: Segment[];
  /** 주의 구간 길이 합(km) */
  cautionKm: number;
  /** 데이터 부족 구간 길이 / 전체 길이 */
  noDataRatio: number;
}

const span = (s: Segment) => s.endKm - s.startKm;

export function summarize(course: Course, segments: Segment[]): CourseSummary {
  const caution = cautionSegments(segments);
  const total = segments.reduce((m, s) => m + span(s), 0);
  const noData = segments.filter((s) => s.level === null).reduce((m, s) => m + span(s), 0);
  return {
    course,
    segments,
    level: courseLevel(segments),
    caution,
    cautionKm: caution.reduce((m, s) => m + span(s), 0),
    noDataRatio: total > 0 ? noData / total : 0,
  };
}

/** 목록 순서: 코스 등급 낮은 순 → 주의 구간 길이 합 짧은 순. 등급을 모르는 코스는 낮은 쪽으로 보이지 않게 맨 뒤 */
export function sortCourses(list: readonly CourseSummary[]): CourseSummary[] {
  const rank = (s: CourseSummary) => s.level ?? Infinity;
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.cautionKm - b.cautionKm ||
      a.course.lengthKm - b.course.lengthKm ||
      a.course.id.localeCompare(b.course.id),
  );
}

/** 목록 행의 한 줄 이유 */
export function courseLine(s: CourseSummary): string {
  if (s.level === null) return '모든 구간 데이터 부족 · 등급을 정하지 못함';
  const caution = s.caution.length > 0 ? `주의 구간 ${s.caution.length}곳` : '주의 구간 없음';
  return `${caution} · 가장 위험한 구간 ${s.level}단계`;
}
