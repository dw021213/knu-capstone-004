// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { latLngToCell } from 'h3-js';
import { toCellScore } from '../data/snapshot';
import type { CellScore, Course } from '../data/types';
import { olleItems } from './courseData';

// 셀 하나 안에서 짧게 움직이는 코스(동쪽 끝 = 위험, 서쪽 끝 = 낮음)
const course = (id: string, lat: number): Course => ({
  id,
  name: id,
  lengthKm: 0.1,
  coords: [
    [126.5, lat],
    [126.5005, lat],
  ],
});
const risky = course('olle-1', 33.3);
const calm = course('olle-2', 33.45);
const cells = new Map<string, CellScore>([
  [latLngToCell(33.3, 126.5, 8), toCellScore('a', 99, 'standard_link')],
  [latLngToCell(33.45, 126.5, 8), toCellScore('b', 5, 'standard_link')],
]);

describe('olleItems', () => {
  it('위험한 정도로 줄 세우지 않고 자료 순서(코스 번호) 그대로 둔다', () => {
    const items = olleItems([risky, calm], cells);
    expect(items.map((it) => it.summary.groups.length)).toEqual([1, 0]);
    expect(items.map((it) => it.summary.course.id)).toEqual(['olle-1', 'olle-2']);
    expect(items.map((it) => it.href)).toEqual(['/courses/olle-1', '/courses/olle-2']);
  });
});
