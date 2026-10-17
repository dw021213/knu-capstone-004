// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PoiLayer } from '../../data/types';
import { PILL_MAX_SHIFT, pillText, placeMarkers } from '../map/markerCanvas';
import {
  CLUSTER_MAX_Z,
  CLUSTER_PX,
  LOW_ZOOM,
  MAX_PILLS_LOW_ZOOM,
  buildMarkerLayout,
} from './markerLayout';

const layer = (type: PoiLayer['type'], pts: [number, number][]): PoiLayer => ({
  type,
  status: 'ready',
  source: '',
  items: pts.map(([lng, lat], i) => ({ id: `${type}-${i}`, type, name: `${i}`, lng, lat })),
});

// 시험용 투영: 화면 = (경도, 위도) × k + (x, y)
const ctx = (zoom: number, view = { k: 1, x: 0, y: 0 }) => ({
  width: 400,
  height: 800,
  zoom,
  view,
  project: (lng: number, lat: number): [number, number] => [
    lng * view.k + view.x,
    lat * view.k + view.y,
  ],
});

const overlap = (a: number[], b: number[]) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

describe('buildMarkerLayout', () => {
  const cctv = layer('cctv', [
    [10, 10],
    [12, 14],
    [15, 11],
    [300, 500],
    [5000, 10],
  ]);
  const fire = layer('fire', [[200, 200]]);

  it(`z<${CLUSTER_MAX_Z}에서는 종류별 클러스터, 하나뿐인 칸은 개별 마커`, () => {
    const items = buildMarkerLayout([cctv, fire])(ctx(10));
    const clusters = items.filter((i) => i.kind === 'cluster');
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ group: 'cctv', label: 'CCTV', count: 3, shape: 'square' });
    const markers = items.filter((i) => i.kind === 'marker');
    expect(markers.map((m) => m.id).sort()).toEqual(['cctv-3', 'fire-0']);
    expect(markers.find((m) => m.id === 'fire-0')?.shape).toBe('triangle');
  });

  it('화면 밖(여백 넘게)은 빼고, 화면 안 시설 수와 묶음 수 합이 같다', () => {
    const items = buildMarkerLayout([cctv])(ctx(10));
    const total = items.reduce((s, i) => s + (i.kind === 'cluster' ? i.count! : 1), 0);
    expect(total).toBe(4);
    expect(items.some((i) => i.x > 1000)).toBe(false);
  });

  it(`z≥${CLUSTER_MAX_Z}에서는 개별 마커만, 화면 좌표 그대로`, () => {
    const view = { k: 2, x: -10, y: 5 };
    const items = buildMarkerLayout([cctv])(ctx(CLUSTER_MAX_Z, view));
    expect(items.every((i) => i.kind === 'marker')).toBe(true);
    // (300, 500)은 k=2에서 y=1005로 화면(800) 밖
    expect(items.map((i) => i.id)).toEqual(['cctv-0', 'cctv-1', 'cctv-2']);
    expect(items[0]).toMatchObject({ id: 'cctv-0', x: 10, y: 25 });
  });

  it('줌 경계: 12.9는 클러스터, 13은 개별 마커', () => {
    const kinds = (z: number) => new Set(buildMarkerLayout([cctv])(ctx(z)).map((i) => i.kind));
    expect(kinds(12.9).has('cluster')).toBe(true);
    expect([...kinds(13)]).toEqual(['marker']);
  });

  it('끌어도(x, y만 바뀜) 묶음 구성이 같다', () => {
    const pts = Array.from({ length: 80 }, (_, i): [number, number] => [
      100 + ((i * 37) % 200),
      100 + ((i * 53) % 600),
    ]);
    const l = layer('convenience', pts);
    const sig = (view: { k: number; x: number; y: number }) =>
      buildMarkerLayout([l])(ctx(10, view))
        .map((i) => `${Math.round(i.x - view.x)},${Math.round(i.y - view.y)}:${i.count ?? 1}`)
        .sort();
    const a = sig({ k: 1, x: 0, y: 0 });
    expect(a.length).toBeGreaterThan(5);
    expect(sig({ k: 1, x: CLUSTER_PX / 3, y: 7 })).toEqual(a);
    expect(sig({ k: 1, x: -CLUSTER_PX / 2, y: -20 })).toEqual(a);
  });
});

// ── 알약 자리: 실제 위치에서 멀리 밀리지 않고, 겹치지 않고, 낮은 줌에서 너무 많지 않게 ──

/** 결정적 의사 난수(LCG) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 섬처럼 가운데가 빽빽한 점 n개. 중심 (cx, cy), 반폭 (rx, ry) */
function blob(seed: number, n: number, cx: number, cy: number, rx: number, ry: number) {
  const r = rng(seed);
  return Array.from({ length: n }, (): [number, number] => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * (r() < 0.5 ? 1 : r());
    return [cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d];
  });
}

// 글자 폭: 한글 12px, 나머지 7.5px(12px 굵은 글꼴 근사)
const measureText = (t: string) => [...t].reduce((s, ch) => s + (/[가-힣]/.test(ch) ? 12 : 7.5), 0);

describe('알약 배치(배치 → placeMarkers)', () => {
  const three = (scale: number, cx: number, cy: number) => [
    layer('cctv', blob(1, 1291, cx, cy, 560 * scale, 300 * scale)),
    layer('convenience', blob(2, 1300, cx + 20 * scale, cy - 10 * scale, 540 * scale, 290 * scale)),
    layer('lodging', blob(3, 1153, cx - 15 * scale, cy + 5 * scale, 580 * scale, 310 * scale)),
  ];
  const cases = [
    { name: '1440 첫 화면(z10.9)', width: 1440, height: 900, zoom: 10.9, scale: 1 },
    { name: '390 첫 화면(z9.2)', width: 390, height: 844, zoom: 9.2, scale: 0.3 },
    { name: '줌 12(묶음 수 제한 없음)', width: 1440, height: 900, zoom: 12, scale: 2.2 },
  ];
  for (const c of cases) {
    it(`${c.name}: 모든 알약 중심이 자기 묶음 무게중심에서 ${PILL_MAX_SHIFT}px 안, 알약끼리 겹침 0`, () => {
      const layers = three(c.scale, c.width / 2, c.height / 2);
      const pts = new Map(layers.flatMap((l) => l.items.map((p) => [p.id, p] as const)));
      const items = buildMarkerLayout(layers)({
        ...ctx(c.zoom),
        width: c.width,
        height: c.height,
        measure: measureText,
      });
      const hits = placeMarkers(items, measureText);
      const pills = hits.filter((h) => h.kind === 'cluster');
      expect(pills.length).toBeGreaterThan(3);
      for (const p of pills) {
        // 묶음 무게중심 = 묶인 점들의 평균
        const members = p.ids!.map((id) => pts.get(id)!);
        expect(members).toHaveLength(p.count!);
        const gx = members.reduce((s, m) => s + m.lng, 0) / members.length;
        const gy = members.reduce((s, m) => s + m.lat, 0) / members.length;
        expect(p.anchor![0]).toBeCloseTo(gx, 6);
        expect(p.anchor![1]).toBeCloseTo(gy, 6);
        expect(Math.hypot(p.x - gx, p.y - gy)).toBeLessThanOrEqual(PILL_MAX_SHIFT + 1e-9);
      }
      const bad: string[] = [];
      for (let i = 0; i < pills.length; i++)
        for (let j = i + 1; j < pills.length; j++)
          if (overlap(pills[i].box, pills[j].box))
            bad.push(`${pillText(pills[i])}/${pillText(pills[j])}`);
      expect(bad).toEqual([]);
    });
  }

  it(`z<${LOW_ZOOM}에서는 종류마다 알약이 ${MAX_PILLS_LOW_ZOOM}개를 넘지 않고, 합은 화면 안 시설 수와 같다`, () => {
    const layers = three(1, 720, 450);
    const items = buildMarkerLayout(layers)({
      ...ctx(10.9),
      width: 1440,
      height: 900,
      measure: measureText,
    });
    for (const l of layers) {
      const mine = items.filter((i) => i.group === l.type);
      expect(mine.filter((i) => i.kind === 'cluster').length).toBeLessThanOrEqual(
        MAX_PILLS_LOW_ZOOM,
      );
      expect(mine.reduce((s, i) => s + (i.count ?? 1), 0)).toBe(l.items.length);
    }
  });

  it('같은 자리에 겹친 다른 종류 알약 셋은 세로로 쌓는다(한 칸 안)', () => {
    const at = (type: PoiLayer['type']) =>
      layer(
        type,
        Array.from({ length: 5 }, (): [number, number] => [400, 300]),
      );
    const items = buildMarkerLayout([at('cctv'), at('convenience'), at('lodging')])({
      ...ctx(12),
      measure: measureText,
    });
    const pills = placeMarkers(items, measureText).filter((h) => h.kind === 'cluster');
    expect(pills).toHaveLength(3);
    for (const p of pills)
      expect(Math.hypot(p.x - 400, p.y - 300)).toBeLessThanOrEqual(PILL_MAX_SHIFT);
    expect(new Set(pills.map((p) => Math.round(p.y))).size).toBe(3);
  });
});
