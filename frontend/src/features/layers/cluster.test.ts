import { describe, expect, it } from 'vitest';
import { clusterPoints, inView } from './cluster';

// 시험용 투영: 경도·위도를 그대로 화면 px로 쓴다
const identity = (lng: number, lat: number): [number, number] => [lng, lat];
const pt = (id: string, lng: number, lat: number) => ({ id, lng, lat });

describe('clusterPoints', () => {
  it('빈 입력은 빈 결과', () => {
    expect(clusterPoints([], identity)).toEqual([]);
  });

  it('같은 격자 칸(기본 48px)의 점은 하나로 묶고 위치는 평균', () => {
    const out = clusterPoints([pt('a', 1, 1), pt('b', 9, 21), pt('c', 47, 47)], identity);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
    expect(out[0].ids).toEqual(['a', 'b', 'c']);
    expect(out[0].x).toBeCloseTo(19);
    expect(out[0].y).toBeCloseTo(23);
  });

  it('다른 칸의 점은 따로 묶는다(음수 좌표 포함)', () => {
    const out = clusterPoints(
      [pt('a', 10, 10), pt('b', 50, 10), pt('c', 10, 60), pt('d', -10, 10), pt('e', 12, 12)],
      identity,
    );
    expect(out.map((c) => c.ids)).toEqual([['a', 'e'], ['b'], ['c'], ['d']]);
  });

  it('칸 크기를 바꿀 수 있다', () => {
    const pts = [pt('a', 10, 10), pt('b', 70, 10)];
    expect(clusterPoints(pts, identity, 48)).toHaveLength(2);
    expect(clusterPoints(pts, identity, 100)).toHaveLength(1);
  });

  it('묶음 수의 합은 입력 수와 같고 모든 id가 한 번씩 들어간다', () => {
    const pts = Array.from({ length: 500 }, (_, i) => pt(`p${i}`, (i * 37) % 400, (i * 91) % 700));
    const out = clusterPoints(pts, identity, 48);
    expect(out.reduce((s, c) => s + c.count, 0)).toBe(500);
    const ids = out.flatMap((c) => c.ids);
    expect(new Set(ids).size).toBe(500);
    for (const c of out) expect(c.ids).toHaveLength(c.count);
  });

  it('투영 함수로 화면 좌표를 얻는다', () => {
    const scale2 = (lng: number, lat: number): [number, number] => [lng * 2, lat * 2];
    const out = clusterPoints([pt('a', 10, 10), pt('b', 30, 10)], scale2, 48);
    expect(out.map((c) => [c.x, c.y])).toEqual([
      [20, 20],
      [60, 20],
    ]);
  });
});

describe('inView', () => {
  it('화면 안과 여백 안은 참, 밖은 거짓', () => {
    expect(inView(0, 0, 390, 844)).toBe(true);
    expect(inView(390, 844, 390, 844)).toBe(true);
    expect(inView(-20, 400, 390, 844, 24)).toBe(true);
    expect(inView(-30, 400, 390, 844, 24)).toBe(false);
    expect(inView(200, 900, 390, 844, 24)).toBe(false);
  });
});
