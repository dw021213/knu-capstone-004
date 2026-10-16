// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Segment } from '../../entities/course/segments';
import { summarize } from '../../entities/course/summary';
import { bboxOf, courseFocus, courseRoute, routeCells, segmentFocus, segmentMid } from './route';

const seg = (index: number, h3: string, level: Segment['level'], coords: [number, number][]) => ({
  index,
  h3,
  level,
  startKm: index,
  endKm: index + 1,
  coords,
});
const segs: Segment[] = [
  seg(0, 'a', 2, [
    [126.5, 33.4],
    [126.51, 33.4],
  ]),
  seg(1, 'b', 5, [
    [126.51, 33.4],
    [126.52, 33.41],
    [126.53, 33.41],
  ]),
  seg(2, 'a', null, [
    [126.53, 33.41],
    [126.54, 33.42],
  ]),
];
const s = summarize({ id: 'c', name: 'c', lengthKm: 3, coords: [] }, segs);

describe('courseRoute', () => {
  it('구간마다 선 하나(등급 그대로), 주의 구간마다 가운데 점에 1부터 번호', () => {
    const r = courseRoute(s);
    expect(r.lines.map((l) => l.level)).toEqual([2, 5, null]);
    expect(r.marks).toEqual([{ lngLat: [126.52, 33.41], label: '1' }]);
    expect(segmentMid(segs[1])).toEqual([126.52, 33.41]);
  });

  it('경로가 지나는 셀만 흐리게 하지 않는다', () => {
    expect([...routeCells(s)].sort()).toEqual(['a', 'b']);
  });
});

describe('맞춤', () => {
  it('코스 전체는 줌 9~14, 모바일은 아래 시트 위(0.3)에 가운데를 둔다', () => {
    const coords = segs.flatMap((g) => g.coords);
    expect(bboxOf(coords)).toEqual([126.5, 33.4, 126.54, 33.42]);
    const f = courseFocus(0, coords, false);
    expect(f).toMatchObject({ key: 0, zoom: { min: 9, max: 14 }, anchorY: 0.3 });
    expect(f.point[0]).toBeCloseTo(126.52, 6);
    expect(f.point[1]).toBeCloseTo(33.41, 6);
    expect(courseFocus(0, coords, true).anchorY).toBe(0.5);
  });

  it('주의 구간은 그 구간 가운데 점으로 줌 14~15', () => {
    expect(segmentFocus(3, segs[1], false)).toEqual({
      key: 3,
      bbox: [126.51, 33.4, 126.53, 33.41],
      point: [126.52, 33.41],
      zoom: { min: 14, max: 15 },
      anchorY: 0.3,
    });
  });
});
