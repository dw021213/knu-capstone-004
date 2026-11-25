// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Level } from '../risk/level';
import { CAUTION_GAP_M, byLength, cautionGroups, groupCoords } from './caution';
import type { Segment } from './segments';

/** [등급, 길이 km] 목록 → 이어진 셀 구간 */
function course(spec: [Level | null, number][]): Segment[] {
  let km = 0;
  return spec.map(([level, len], index) => {
    const s: Segment = {
      index,
      h3: `h${index}`,
      level,
      startKm: km,
      endKm: km + len,
      coords: [[index, 0]],
    };
    km += len;
    return s;
  });
}

const ids = (segs: Segment[]) => cautionGroups(segs).map((g) => g.segments.map((s) => s.index));

describe('cautionGroups', () => {
  it('4단계 이상 구간을 코스 순서로 이어 붙인다', () => {
    expect(
      ids(
        course([
          [2, 1],
          [4, 0.5],
          [5, 0.4],
          [3, 1],
          [4, 0.2],
        ]),
      ),
    ).toEqual([[1, 2], [4]]);
  });

  it(`사이에 끼인 낮은 등급·데이터 부족 구간이 ${CAUTION_GAP_M}m 이하면 같은 묶음, 넘으면 따로`, () => {
    // 1.0km에서 끝나고 1.3km에서 다시 시작: 정확히 300m(소수 오차가 있어도 묶는다)
    expect(
      ids(
        course([
          [5, 1],
          [2, 0.1],
          [null, 0.2],
          [4, 0.5],
        ]),
      ),
    ).toEqual([[0, 1, 2, 3]]);
    expect(
      ids(
        course([
          [5, 1],
          [2, 0.301],
          [4, 0.5],
        ]),
      ),
    ).toEqual([[0], [2]]);
  });

  it('묶음은 늘 주의할 구간으로 시작하고 끝난다(앞뒤의 낮은 구간은 넣지 않는다)', () => {
    const [g] = cautionGroups(
      course([
        [1, 0.1],
        [4, 0.5],
        [2, 0.1],
      ]),
    );
    expect(g.segments.map((s) => s.index)).toEqual([1]);
    expect(g.id).toBe(1);
    expect(g.startKm).toBeCloseTo(0.1, 9);
    expect(g.endKm).toBeCloseTo(0.6, 9);
    expect(groupCoords(g)).toEqual([[1, 0]]);
  });

  it('주의할 구간이 없으면 묶음도 없다', () => {
    expect(
      cautionGroups(
        course([
          [3, 1],
          [null, 1],
        ]),
      ),
    ).toEqual([]);
    expect(cautionGroups([])).toEqual([]);
  });
});

describe('byLength', () => {
  it('긴 묶음부터, 길이가 같으면 코스 앞쪽부터', () => {
    const groups = cautionGroups(
      course([
        [4, 0.2],
        [1, 1],
        [5, 0.9],
        [1, 1],
        [4, 0.2],
        [1, 1],
        [4, 0.5],
      ]),
    );
    expect(byLength(groups).map((g) => g.id)).toEqual([2, 6, 0, 4]);
  });
});
