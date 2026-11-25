import type { Level } from '../risk/level';
import type { Segment } from './segments';

/** 색 띠 한 조각: 같은 등급이 이어지는 구간을 하나로 합친 것 */
export interface BandPiece {
  level: Level | null;
  /** 띠 전체 길이에서 차지하는 비율(0~1) */
  share: number;
}

/** 구간 등급 색을 거리 비례로 이어 붙인 띠 조각. 이웃한 같은 등급은 한 조각으로 합친다 */
export function bandPieces(segs: readonly Segment[]): BandPiece[] {
  if (segs.length === 0) return [];
  const total = segs[segs.length - 1].endKm - segs[0].startKm;
  if (total <= 0) return [];
  const out: BandPiece[] = [];
  for (const s of segs) {
    const share = (s.endKm - s.startKm) / total;
    const last = out.at(-1);
    if (last && last.level === s.level) last.share += share;
    else out.push({ level: s.level, share });
  }
  return out;
}
