// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { geoArea, geoContains } from 'd3';
import { cellToLatLng } from 'h3-js';
import { cellPolygon, cellCenter } from './h3';

const scores = JSON.parse(
  readFileSync(new URL('../../../public/data/scores.json', import.meta.url), 'utf8'),
) as { cells: Record<string, unknown> };
const ids = Object.keys(scores.cells);

describe('cellPolygon', () => {
  it('scores.json 셀 3,651개 모두 d3 기준 작은 넓이(시계 방향)', () => {
    expect(ids).toHaveLength(3651);
    const wrong = ids.filter((h) => !(geoArea(cellPolygon(h)) < 1e-6));
    expect(wrong).toEqual([]);
  });

  it('외곽이 닫혀 있고 셀 중심을 안에 품는다', () => {
    const h = ids[0];
    const ring = cellPolygon(h).coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(geoContains(cellPolygon(h), cellCenter(h))).toBe(true);
  });
});

describe('cellCenter', () => {
  it('[경도, 위도] 순서로 돌려준다', () => {
    const h = ids[0];
    const [lat, lng] = cellToLatLng(h);
    expect(cellCenter(h)).toEqual([lng, lat]);
  });
});
