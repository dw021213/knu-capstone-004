import { describe, expect, it } from 'vitest';
import type { Poi, PoiLayer, PoiType } from '../../data/types';
import { distanceMeters } from '../../shared/geo/distance';
import { countNearby, nearest } from './nearby';

const R = 6371008.8;
const CENTER: [number, number] = [126.5312, 33.4996];

/** CENTER에서 정북으로 m미터 떨어진 점(같은 경선 위라 하버사인 거리가 m) */
const north = (m: number): [number, number] => [CENTER[0], CENTER[1] + ((m / R) * 180) / Math.PI];

function poi(type: PoiType, id: string, [lng, lat]: [number, number]): Poi {
  return { id, type, name: id, lng, lat };
}

function layer(type: PoiType, points: [number, number][]): PoiLayer {
  return {
    type,
    status: 'ready',
    source: '테스트',
    items: points.map((p, i) => poi(type, `${type}-${i}`, p)),
  };
}

describe('countNearby', () => {
  it('전제: 북쪽 점의 거리가 정확하다', () => {
    expect(distanceMeters(CENTER, north(299))).toBeCloseTo(299, 3);
    expect(distanceMeters(CENTER, north(501))).toBeCloseTo(501, 3);
  });

  it('299m는 300m 안에, 501m는 500m 밖으로 센다', () => {
    const out = countNearby(CENTER, [layer('cctv', [north(299), north(501)])]);
    expect(out.cctv).toEqual({ r300: 1, r500: 1 });
  });

  it('500m 안 개수는 300m 안 개수를 포함한다', () => {
    const out = countNearby(CENTER, [
      layer('convenience', [north(0), north(299.5), north(301), north(499.5), north(2000)]),
    ]);
    expect(out.convenience).toEqual({ r300: 2, r500: 4 });
  });

  it('시설이 없으면 0, 받지 못했거나 pending인 종류는 pending', () => {
    const pending: PoiLayer = { type: 'police', status: 'pending', source: '', items: [] };
    const out = countNearby(CENTER, [layer('fire', []), pending]);
    expect(out.fire).toEqual({ r300: 0, r500: 0 });
    expect(out.police).toBe('pending');
    expect(out.cctv).toBe('pending');
    expect(out.lodging).toBe('pending');
  });
});

describe('nearest', () => {
  it('가장 가까운 시설과 거리', () => {
    const l = layer('fire', [north(900), north(400), north(1200)]);
    const got = nearest(CENTER, l);
    expect(got?.poi.id).toBe('fire-1');
    expect(got?.meters).toBeCloseTo(400, 3);
  });

  it('항목이 없으면 null', () => {
    expect(nearest(CENTER, { items: [] })).toBeNull();
  });
});
