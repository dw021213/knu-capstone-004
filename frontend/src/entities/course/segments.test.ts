// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { gridDisk, gridDistance, latLngToCell } from 'h3-js';
import { distanceMeters } from '../../shared/geo/distance';
import { cellCenter } from '../../shared/geo/h3';
import type { Level } from '../risk/level';
import { cautionSegments, courseLevel, densify, segmentCourse, type Segment } from './segments';

type P = [number, number];

// 나란히 놓인 세 셀 A-B-C(서귀포 앞 내륙). B는 A의 이웃, C는 A→B 방향으로 한 칸 더
const A = latLngToCell(33.3, 126.55, 8);
const aC = cellCenter(A);
const B = gridDisk(A, 1).find((h) => h !== A)!;
const bC = cellCenter(B);
const d: P = [bC[0] - aC[0], bC[1] - aC[1]];
const C = latLngToCell(bC[1] + d[1], bC[0] + d[0], 8);
const cC = cellCenter(C);
const at = (c: P, t: number): P => [c[0] + d[0] * t, c[1] + d[1] * t];

/** 셀 중심 앞뒤(중심 간 거리의 ±20%, 셀 안쪽)를 오가며 셀 하나에서 약 1km를 걷는 점들 */
const wander = (c: P): P[] => [at(c, -0.2), at(c, 0.2), at(c, -0.2), at(c, 0.2)];

const lengthKm = (coords: P[]) => {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distanceMeters(coords[i - 1], coords[i]);
  return m / 1000;
};

const levels = (map: Record<string, Level | null>) => (h3: string) => map[h3] ?? null;

describe('합성 경로 준비', () => {
  it('A·B·C는 서로 다른 셀이고 한 줄로 이웃한다', () => {
    expect(gridDistance(A, B)).toBe(1);
    expect(gridDistance(B, C)).toBe(1);
    expect(gridDistance(A, C)).toBe(2);
  });
});

describe('densify', () => {
  it('점 사이를 50m 이하로 촘촘히 하고 원래 점은 그대로 둔다', () => {
    const coords: P[] = [aC, bC];
    const out = densify(coords);
    expect(out[0]).toEqual(aC);
    expect(out[out.length - 1]).toEqual(bC);
    for (let i = 1; i < out.length; i++) {
      expect(distanceMeters(out[i - 1], out[i])).toBeLessThanOrEqual(50.5);
    }
    expect(lengthKm(out)).toBeCloseTo(lengthKm(coords), 3);
  });

  it('간격을 바꿀 수 있다', () => {
    const out = densify([aC, bC], 200);
    expect(out.length).toBe(Math.ceil((lengthKm([aC, bC]) * 1000) / 200) + 1);
  });
});

describe('segmentCourse와 courseLevel', () => {
  // A(1단계) → B(5단계) → C(1단계), 셀마다 약 1km
  const path: P[] = [...wander(aC), ...wander(bC), ...wander(cC)];
  const segs = segmentCourse(path, levels({ [A]: 1, [B]: 5, [C]: 1 }));

  it('셀이 바뀔 때마다 구간을 나눈다: 구간 3개', () => {
    expect(segs.map((s) => s.h3)).toEqual([A, B, C]);
    expect(segs.map((s) => s.level)).toEqual([1, 5, 1]);
    expect(segs.map((s) => s.index)).toEqual([0, 1, 2]);
    for (const s of segs) {
      expect(s.endKm - s.startKm).toBeGreaterThan(0.8);
      expect(s.endKm - s.startKm).toBeLessThan(1.6);
    }
  });

  it('코스 등급은 가장 위험한 구간 등급(5)이고 평균(2.33)이 아니다', () => {
    const lv = courseLevel(segs);
    expect(lv).toBe(5);
    const mean = segs.reduce((s, x) => s + (x.level ?? 0), 0) / segs.length;
    expect(mean).toBeCloseTo(7 / 3, 5);
    expect(lv).not.toBeCloseTo(mean, 1);
  });

  it('주의 구간(4단계 이상)은 B 하나', () => {
    expect(cautionSegments(segs).map((s) => s.h3)).toEqual([B]);
    // 기준을 낮추면 더 많이 잡힌다
    expect(cautionSegments(segs, 1)).toHaveLength(3);
  });

  it('startKm/endKm이 끊기지 않고 마지막 endKm은 전체 길이', () => {
    expect(segs[0].startKm).toBe(0);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].startKm).toBe(segs[i - 1].endKm);
      // 그리기용 좌표도 이어진다
      expect(segs[i].coords[0]).toEqual(segs[i - 1].coords[segs[i - 1].coords.length - 1]);
    }
    expect(segs[segs.length - 1].endKm).toBeCloseTo(lengthKm(path), 6);
  });

  it('같은 셀을 두 번 지나면 그 셀 구간이 두 개다', () => {
    const back = segmentCourse([aC, bC, aC], levels({ [A]: 2, [B]: 3 }));
    expect(back.map((s) => s.h3)).toEqual([A, B, A]);
    expect(back.filter((s) => s.h3 === A)).toHaveLength(2);
  });
});

describe('데이터 부족 구간', () => {
  const path: P[] = [...wander(aC), ...wander(bC), ...wander(cC)];

  it('점수가 없는 셀 구간은 level null이고 코스 등급 계산에서 빠진다', () => {
    const segs = segmentCourse(path, levels({ [A]: 2, [C]: 3 }));
    expect(segs.map((s) => s.level)).toEqual([2, null, 3]);
    expect(courseLevel(segs)).toBe(3);
    expect(cautionSegments(segs)).toEqual([]);
  });

  it('모든 구간이 데이터 부족이면 코스 등급도 null', () => {
    const segs = segmentCourse(path, () => null);
    expect(courseLevel(segs)).toBeNull();
    expect(courseLevel([] as Segment[])).toBeNull();
  });
});
