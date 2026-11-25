import type { Level } from '../risk/level';
import type { Segment } from './segments';

/** 이 등급 이상인 셀 구간을 주의할 구간으로 본다 */
export const CAUTION_MIN_LEVEL: Level = 4;

/**
 * 주의할 구간 사이에 끼인 낮은 등급·데이터 부족 구간이 이 길이(m) 이하이면 한 묶음으로 본다.
 * 셀(약 0.5km) 하나를 걸쳐 지나는 짧은 틈마다 목록 줄이 갈라지지 않게 한다
 */
export const CAUTION_GAP_M = 300;

/** 상세 목록에 먼저 보이는 묶음 수(길이가 긴 순) */
export const CAUTION_PREVIEW = 5;

/** 주의할 구간 묶음. 처음과 끝은 늘 주의할 구간이고, 사이에 끼인 짧은 낮은 구간을 품을 수 있다 */
export interface CautionGroup {
  /** 첫 셀 구간의 index. 코스 안에서 겹치지 않아 묶음 id로 쓴다 */
  id: number;
  /** 코스 순서의 셀 구간(끼인 구간 포함) */
  segments: Segment[];
  startKm: number;
  endKm: number;
}

const isCaution = (s: Segment) => s.level !== null && s.level >= CAUTION_MIN_LEVEL;

/** 주의할 구간을 코스 순서로 이어 붙여 묶는다 */
export function cautionGroups(segs: readonly Segment[], gapM = CAUTION_GAP_M): CautionGroup[] {
  const out: CautionGroup[] = [];
  let from = -1;
  let to = -1;
  const close = () => {
    if (from < 0) return;
    out.push({
      id: segs[from].index,
      segments: segs.slice(from, to + 1),
      startKm: segs[from].startKm,
      endKm: segs[to].endKm,
    });
  };
  segs.forEach((s, i) => {
    if (!isCaution(s)) return;
    // km 차를 m로 반올림해 견준다(1.3 - 1.0 = 0.30000000000000004 같은 소수 오차로 300m가 갈라지지 않게)
    if (from >= 0 && Math.round((s.startKm - segs[to].endKm) * 1000) <= gapM) {
      to = i;
      return;
    }
    close();
    from = i;
    to = i;
  });
  close();
  return out;
}

/** 목록 순서: 긴 묶음부터, 길이가 같으면 코스 앞쪽부터 */
export function byLength(groups: readonly CautionGroup[]): CautionGroup[] {
  const len = (g: CautionGroup) => Math.round((g.endKm - g.startKm) * 1000);
  return [...groups].sort((a, b) => len(b) - len(a) || a.startKm - b.startKm);
}

/** 묶음의 좌표(셀 구간 좌표를 이어 붙인 것) */
export const groupCoords = (g: CautionGroup): [number, number][] =>
  g.segments.flatMap((s) => s.coords);
