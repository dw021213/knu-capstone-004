import type { CellScore } from '../../data/types';
import { LEVEL_NAME } from '../risk/level';
import type { Segment } from './segments';
import type { CourseSummary } from './summary';

/** 목록 행에 데이터 부족 비율을 따로 적는 기준(코스 길이 대비) */
export const NO_DATA_NOTE_RATIO = 0.2;

const pct = (r: number) => Math.round(r * 100);
const km1 = (v: number) => v.toFixed(1);

/** 코스 상세 설명. 코스 등급이 평균이 아니라 가장 위험한 구간 기준임을 밝힌다 */
export function courseReason(s: CourseSummary): string {
  const missing = '위험하지 않다는 뜻은 아니에요.';
  if (s.level === null) {
    return `이 코스가 지나는 구간 모두 도로 자료가 확인되지 않아 코스 등급을 정하지 못했어요. ${missing}`;
  }
  const parts = [
    `이 코스가 지나는 셀 구간 ${s.segments.length}개 중 가장 위험한 구간이 ${s.level}단계(${LEVEL_NAME[s.level]})라 코스 등급을 ${s.level}단계로 정했어요.`,
    '구간 등급의 평균이 아니라 가장 위험한 구간을 기준으로 해요.',
    s.caution.length > 0
      ? `4단계 이상인 주의 구간은 ${s.caution.length}곳, 합쳐서 ${km1(s.cautionKm)}km예요.`
      : '4단계 이상인 주의 구간은 없어요.',
  ];
  if (s.noDataRatio > 0) {
    parts.push(
      `도로 자료가 확인되지 않은 구간(${pct(s.noDataRatio)}%)은 등급 계산에서 빠졌어요. ${missing}`,
    );
  }
  return parts.join(' ');
}

/** 주의 구간 이유 한 줄(셀 시트 근거 문장과 같은 상위 비율) */
export function cautionReason(cell: CellScore | undefined): string {
  if (!cell || cell.percentile === null) return '도로 자료 미확인';
  return `도로가 있는 제주 격자 중 교통사고 위험 상위 ${Math.max(1, Math.round(100 - cell.percentile))}%`;
}

/** '3.2~3.6km', 반올림해 같아지면 '3.2km 지점' */
export function segmentRange(seg: Segment): string {
  const a = km1(seg.startKm);
  const b = km1(seg.endKm);
  return a === b ? `${a}km 지점` : `${a}~${b}km`;
}

/** 목록 행: 데이터 부족 구간이 많으면 한 줄 */
export function noDataLine(ratio: number): string | null {
  return ratio >= NO_DATA_NOTE_RATIO ? `데이터 부족 구간 ${pct(ratio)}% (도로 자료 미확인)` : null;
}
