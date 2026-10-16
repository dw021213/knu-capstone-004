// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MARKER_HIT_RADIUS,
  PILL_H,
  hitTest,
  pillText,
  placeMarkers,
  type MarkerItem,
} from './markerCanvas';

const measure = (t: string) => t.length * 7;
const pill = (x: number, y: number, count = 12, group = 'cctv'): MarkerItem => ({
  kind: 'cluster',
  group,
  shape: 'square',
  x,
  y,
  label: 'CCTV',
  count,
});
const marker = (x: number, y: number, id: string, group = 'cctv'): MarkerItem => ({
  kind: 'marker',
  group,
  shape: 'square',
  x,
  y,
  id,
});
const overlap = (a: number[], b: number[]) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

describe('placeMarkers', () => {
  it('알약은 글자 폭만큼 넓고 높이는 PILL_H, 가운데가 묶음 위치', () => {
    const [h] = placeMarkers([pill(100, 200)], measure);
    expect(pillText(h)).toBe('CCTV 12');
    const [x0, y0, x1, y1] = h.box;
    expect(y1 - y0).toBe(PILL_H);
    expect(x1 - x0).toBeGreaterThan(measure('CCTV 12'));
    expect((x0 + x1) / 2).toBeCloseTo(100);
    expect((y0 + y1) / 2).toBeCloseTo(200);
  });

  it('겹치는 알약은 위아래로 비켜 놓는다', () => {
    const hits = placeMarkers(
      [pill(100, 200), pill(104, 202, 5, 'convenience'), pill(98, 199, 7, 'lodging')],
      measure,
    );
    for (let i = 0; i < hits.length; i++)
      for (let j = i + 1; j < hits.length; j++)
        expect(overlap(hits[i].box, hits[j].box)).toBe(false);
    // 첫 알약은 제자리
    expect((hits[0].box[1] + hits[0].box[3]) / 2).toBeCloseTo(200);
  });

  it('개별 마커는 제자리, 상자는 마커 크기', () => {
    const [h] = placeMarkers([marker(50, 60, 'a')], measure);
    expect(h.x).toBe(50);
    expect(h.y).toBe(60);
    expect(h.box[2] - h.box[0]).toBeLessThan(PILL_H);
  });
});

describe('hitTest', () => {
  const hits = placeMarkers(
    [marker(100, 100, 'a'), marker(130, 100, 'b'), pill(300, 300)],
    measure,
  );

  it('마커 둘레 반경 안이면 가장 가까운 마커', () => {
    expect(hitTest(hits, 104, 102)?.id).toBe('a');
    expect(hitTest(hits, 122, 100)?.id).toBe('b');
    expect(hitTest(hits, 100, 100 + MARKER_HIT_RADIUS - 1)?.id).toBe('a');
  });

  it('반경 밖은 없음', () => {
    expect(hitTest(hits, 100, 100 + MARKER_HIT_RADIUS + 2)).toBeNull();
    expect(hitTest(hits, 200, 200)).toBeNull();
  });

  it('알약은 상자 위아래로 넓혀 44px 높이까지 누를 수 있다', () => {
    const p = hits[2];
    expect(hitTest(hits, p.box[2] - 1, 300 + 21)?.kind).toBe('cluster');
    expect(hitTest(hits, p.box[2] + 30, 300)).toBeNull();
  });
});
