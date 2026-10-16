import { latLngToCell } from 'h3-js';
import { distanceMeters } from '../../shared/geo/distance';
import type { Level } from '../risk/level';

/** 코스가 한 셀 안에 머무는 구간. 같은 셀을 다시 지나면 따로 센다 */
export interface Segment {
  index: number;
  h3: string;
  /** 그 셀 등급. 데이터 부족이면 null */
  level: Level | null;
  startKm: number;
  endKm: number;
  /** [경도, 위도]. 마지막 점은 다음 구간의 첫 점(선이 끊기지 않게) */
  coords: [number, number][];
}

/** 점 사이가 stepM 이하가 되도록 직선 위에 점을 넣는다(원래 점은 그대로) */
export function densify(coords: [number, number][], stepM = 50): [number, number][] {
  if (coords.length === 0) return [];
  const out: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const n = Math.ceil(distanceMeters(a, b) / stepM);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    out.push(b);
  }
  return out;
}

/** 경로를 50m 간격으로 촘촘히 해 점마다 res8 셀을 구하고, 같은 셀이 이어지는 점을 한 구간으로 묶는다 */
export function segmentCourse(
  coords: [number, number][],
  levelOf: (h3: string) => Level | null,
  stepM = 50,
): Segment[] {
  const pts = densify(coords, stepM);
  if (pts.length === 0) return [];
  // 첫 점부터 누적 거리(km)
  const km: number[] = [0];
  for (let i = 1; i < pts.length; i++)
    km.push(km[i - 1] + distanceMeters(pts[i - 1], pts[i]) / 1000);
  const cells = pts.map(([lng, lat]) => latLngToCell(lat, lng, 8));

  const segs: Segment[] = [];
  let from = 0;
  for (let i = 1; i <= pts.length; i++) {
    if (i < pts.length && cells[i] === cells[from]) continue;
    const last = i < pts.length ? i : pts.length - 1;
    segs.push({
      index: segs.length,
      h3: cells[from],
      level: levelOf(cells[from]),
      startKm: km[from],
      endKm: km[last],
      coords: pts.slice(from, last + 1),
    });
    from = i;
  }
  return segs;
}

/** 코스 등급 = 구간 등급의 최댓값(평균이 아니다). 데이터 부족 구간은 빼고, 전부 부족이면 null */
export function courseLevel(segs: Segment[]): Level | null {
  let max: Level | null = null;
  for (const s of segs) if (s.level !== null && (max === null || s.level > max)) max = s.level;
  return max;
}

/** 주의 구간: 등급이 min(기본 4단계) 이상인 구간 */
export function cautionSegments(segs: Segment[], min: Level = 4): Segment[] {
  return segs.filter((s) => s.level !== null && s.level >= min);
}
