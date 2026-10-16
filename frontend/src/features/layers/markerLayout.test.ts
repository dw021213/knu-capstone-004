// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PoiLayer } from '../../data/types';
import { CLUSTER_MAX_Z, CLUSTER_PX, buildMarkerLayout } from './markerLayout';

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
