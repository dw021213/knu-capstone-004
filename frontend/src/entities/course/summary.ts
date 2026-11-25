import type { Course } from '../../data/types';
import { cautionGroups, type CautionGroup } from './caution';
import type { Segment } from './segments';

export interface CourseSummary {
  course: Course;
  segments: Segment[];
  /** 주의할 구간 묶음(코스 순서) */
  groups: CautionGroup[];
  /** 데이터 부족 구간 길이 / 전체 길이 */
  noDataRatio: number;
}

/** 목록 줄에 도로 자료 미확인을 따로 적는 기준(코스 길이 대비) */
export const NO_DATA_NOTE_RATIO = 0.2;

const span = (s: Segment) => s.endKm - s.startKm;

export function summarize(course: Course, segments: Segment[]): CourseSummary {
  const total = segments.reduce((m, s) => m + span(s), 0);
  const noData = segments.filter((s) => s.level === null).reduce((m, s) => m + span(s), 0);
  return {
    course,
    segments,
    groups: cautionGroups(segments),
    noDataRatio: total > 0 ? noData / total : 0,
  };
}

/** '주의할 구간 3곳'. 모든 구간이 데이터 부족이면 없다고 하지 않는다 */
export function cautionCount(s: CourseSummary): string {
  if (s.groups.length > 0) return `주의할 구간 ${s.groups.length}곳`;
  return s.noDataRatio >= 1 ? '도로 자료 미확인' : '주의할 구간 없음';
}

/** 목록 줄: 도로 자료가 확인되지 않은 구간이 많으면 한 줄(빗금이 안전처럼 읽히지 않게) */
export function noDataLine(ratio: number): string | null {
  return ratio >= NO_DATA_NOTE_RATIO ? '도로 자료가 확인되지 않은 구간이 많아요' : null;
}

const km1 = (v: number) => v.toFixed(1);

/** '0.0 ~ 2.2km', 반올림해 같아지면 '3.2km 지점' */
export function kmRange(startKm: number, endKm: number): string {
  const a = km1(startKm);
  const b = km1(endKm);
  return a === b ? `${a}km 지점` : `${a} ~ ${b}km`;
}

/** '삼도2동 ~ 건입동', 같으면 하나. 둘 다 모르면 '구간' */
export function placeRange(from: string | null, to: string | null): string {
  if (from && to && from !== to) return `${from} ~ ${to}`;
  return from ?? to ?? '구간';
}
