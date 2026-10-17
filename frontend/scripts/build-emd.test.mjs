// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { JEJU_BOUNDS } from '../src/features/map/projection';
import { buildEmd, pointInRing, serializeEmd, simplifyRing } from './build-emd.mjs';

const RAW = new URL('../data-src/emd/jeju-emd.geojson', import.meta.url);
const OUT = new URL('../public/data/emd.json', import.meta.url);
const raw = JSON.parse(readFileSync(RAW, 'utf8'));
const built = buildEmd(raw);

const insideAny = (item, p) => item.polygons.some((ring) => pointInRing(p, ring));
const rawInside = (feature, p) =>
  feature.geometry.coordinates.some((poly) => pointInRing(p, poly[0]));

describe('buildEmd', () => {
  it('제주 읍면동 43곳, 이름·시 이름·코드가 있다', () => {
    expect(built.items).toHaveLength(43);
    for (const it of built.items) {
      expect(it.name).toMatch(/[읍면동]$/);
      expect(['제주시', '서귀포시']).toContain(it.sgg);
      expect(it.code).toMatch(/^50\d{8}$/);
    }
    expect(new Set(built.items.map((i) => i.code)).size).toBe(43);
    expect(built.items.map((i) => i.name)).toEqual(
      expect.arrayContaining(['애월읍', '우도면', '추자면', '이도2동', '성산읍']),
    );
  });

  it('대표점은 제주 경계 안이고 자기 경계 안에 있다(지도를 옮기고 셀 시트를 여는 점)', () => {
    for (const it of built.items) {
      const [lng, lat] = it.center;
      expect(lng).toBeGreaterThan(JEJU_BOUNDS.west);
      expect(lng).toBeLessThan(JEJU_BOUNDS.east);
      expect(lat).toBeGreaterThan(JEJU_BOUNDS.south);
      expect(lat).toBeLessThan(JEJU_BOUNDS.north);
      expect(insideAny(it, it.center), it.name).toBe(true);
      // 원본 경계 안에도 있다
      const f = raw.features.find((x) => x.properties.adm_cd2 === it.code);
      expect(rawInside(f, it.center), it.name).toBe(true);
    }
  });

  it('경계 상자가 모든 꼭짓점을 감싼다', () => {
    for (const it of built.items) {
      const [w, s, e, n] = it.bbox;
      for (const ring of it.polygons) {
        for (const [lng, lat] of ring) {
          expect(lng >= w && lng <= e && lat >= s && lat <= n).toBe(true);
        }
      }
    }
  });

  it('줄인 경계에서도 알려진 지점이 원본과 같은 읍면동에 든다', () => {
    const cases = [
      [[126.5312, 33.4996], '이도2동'],
      [[126.493, 33.5113], '용담2동'],
      [[126.9425, 33.459], '성산읍'],
      [[126.953, 33.506], '우도면'],
      [[126.3, 33.96], '추자면'],
      [[126.3317, 33.4636], '애월읍'],
    ];
    for (const [p, name] of cases) {
      const hits = built.items.filter((it) => insideAny(it, p)).map((it) => it.name);
      expect(hits, name).toEqual([name]);
    }
  });

  it('꼭짓점을 원본의 절반 아래로 줄인다', () => {
    const before = raw.features.reduce(
      (s, f) => s + f.geometry.coordinates.reduce((t, poly) => t + poly[0].length, 0),
      0,
    );
    const after = built.items.reduce(
      (s, it) => s + it.polygons.reduce((t, r) => t + r.length, 0),
      0,
    );
    expect(after).toBeLessThan(before / 2);
  });
});

describe('simplifyRing', () => {
  it('직선 위 점은 빼고 모서리는 남긴다', () => {
    const ring = [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(simplifyRing(ring, 0.01)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });
});

describe('public/data/emd.json', () => {
  const text = readFileSync(OUT, 'utf8');

  it('원본에서 다시 만들면 바이트가 같다', () => {
    expect(text).toBe(serializeEmd(built));
  });

  it('출처와 라이선스 표기를 싣는다', () => {
    const file = JSON.parse(text);
    expect(file.source).toContain('통계청 SGIS');
    expect(file.source).toContain('vuski/admdongkor');
    expect(file.license).toContain('CC BY 4.0');
  });

  it('gzip 40KB 이하', () => {
    expect(gzipSync(text).length).toBeLessThanOrEqual(40 * 1024);
  });
});
