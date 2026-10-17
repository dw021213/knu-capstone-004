// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { JEJU_BOUNDS } from '../src/features/map/projection';
import {
  OUT,
  buildCourses,
  chainWays,
  courseNumber,
  distanceM,
  dropStrays,
  lineLengthM,
  readRaw,
  serializeCourses,
} from './build-courses.mjs';

describe('courseNumber', () => {
  it('이름·영문 이름·ref 표기 변형에서 코스 번호를 읽는다', () => {
    expect(courseNumber({ name: '올레길1', ref: 'JOT1' })).toBe(1);
    expect(courseNumber({ name: 'Jeju Olle trail 7', 'name:ko': '올레길7' })).toBe(7);
    expect(courseNumber({ name: 'Ollegil 10' })).toBe(10);
    expect(courseNumber({ 'name:en': 'Olle trail 20', ref: 'JOT20' })).toBe(20);
    expect(courseNumber({ name: '올레길 20코스', 'name:en': 'Jeju Olle Trail 20' })).toBe(20);
    expect(courseNumber({ 'name:en': 'Jeju Olle Trail Route 7' })).toBe(7);
    expect(courseNumber({ name: '올레길6 (Ollegil 6)', ref: 'JOT6' })).toBe(6);
    expect(courseNumber({ name: '제주올레 1코스' })).toBe(1);
  });

  it('갈래 코스·휠체어 구간·올레가 아닌 길은 번호를 주지 않는다', () => {
    expect(courseNumber({ name: '올레길3A', 'name:en': 'Ollegil 3A' })).toBeNull();
    expect(courseNumber({ name: 'Olle trail 6(B)', ref: 'JOT6B' })).toBeNull();
    expect(courseNumber({ 'name:ko': '올레길6(A)', ref: 'JOT6A' })).toBeNull();
    expect(
      courseNumber({
        name: '올레길5 (Ollegil 5) wheelchair',
        'name:ko': '올레길5',
        'name:en': 'Olle trail 5 wheelchair',
        ref: 'JOT5',
      }),
    ).toBeNull();
    expect(courseNumber({ name: '올레길 1-1코스' })).toBeNull();
    expect(courseNumber({ name: '성판악코스', 'name:en': 'Seongpanak Trail' })).toBeNull();
  });

  it('한 자리 번호가 두 자리 번호와 섞이지 않는다', () => {
    expect(courseNumber({ name: 'Ollegil 11' })).toBe(11);
    expect(courseNumber({ name: '올레길 19코스' })).toBe(19);
    expect(courseNumber({ ref: 'JOT14' })).toBe(14);
  });
});

describe('chainWays', () => {
  it('순서가 섞이고 방향이 뒤집힌 way를 끝점이 가까운 순으로 이어 한 줄로 만든다', () => {
    const ways = [
      [
        [126.52, 33.4],
        [126.53, 33.4],
      ],
      [
        [126.5, 33.4],
        [126.51, 33.4],
      ],
      // 뒤집힌 방향
      [
        [126.52, 33.4],
        [126.51, 33.4],
      ],
    ];
    const { coords, gaps } = chainWays(ways);
    expect(coords.map(([x]) => x)).toEqual(expect.arrayContaining([126.5, 126.51, 126.52, 126.53]));
    expect(coords).toHaveLength(4);
    const xs = coords.map(([x]) => x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs[0] === sorted[0] ? xs : [...xs].reverse()).toEqual(sorted);
    expect(gaps).toEqual([]);
  });

  it('끊긴 곳은 이어 붙이고 간격(m)을 남긴다', () => {
    const ways = [
      [
        [126.5, 33.4],
        [126.51, 33.4],
      ],
      [
        [126.52, 33.4],
        [126.53, 33.4],
      ],
    ];
    const { coords, gaps } = chainWays(ways);
    expect(coords).toHaveLength(4);
    expect(gaps).toHaveLength(1);
    // 경도 0.01도(위도 33.4) ≈ 929m
    expect(gaps[0]).toBeGreaterThan(900);
    expect(gaps[0]).toBeLessThan(960);
  });
});

describe('dropStrays', () => {
  it('다른 way 끝점과 멀리 떨어진 짧은 조각만 뺀다', () => {
    const main = [
      [
        [126.5, 33.4],
        [126.51, 33.4],
      ],
      [
        [126.51, 33.4],
        [126.52, 33.4],
      ],
    ];
    // 9m짜리 조각이 1km 넘게 떨어져 있다
    const stray = [
      [126.505, 33.41],
      [126.5051, 33.41],
    ];
    // 짧지만 이어진 조각은 남긴다
    const joined = [
      [126.52, 33.4],
      [126.5201, 33.4],
    ];
    const { kept, dropped } = dropStrays([...main, stray, joined]);
    expect(kept).toEqual([...main, joined]);
    expect(dropped).toEqual([stray]);
  });
});

describe('buildCourses(커밋된 OSM 원본)', () => {
  const raw = readRaw();
  const { file, report } = buildCourses(raw);
  const byNumber = Object.fromEntries(report.map((r) => [r.number, r]));

  it('코스가 1개 이상이고 공식 길이 ±20% 안에 든다', () => {
    expect(file.status).toBe('ready');
    expect(file.items.length).toBeGreaterThanOrEqual(1);
    for (const it of file.items) {
      expect(Math.abs(it.lengthKm - it.officialKm) / it.officialKm, it.name).toBeLessThanOrEqual(
        0.2,
      );
      expect(it.lengthKm).toBeCloseTo(lineLengthM(it.coords) / 1000, 1);
    }
  });

  it('1·10·20코스를 쓰고, OSM 경로가 바뀌기 전 길인 7코스(공식 12.9km)는 뺀다', () => {
    expect(file.items.map((i) => i.id)).toEqual(['olle-1', 'olle-10', 'olle-20']);
    expect(file.items.map((i) => i.name)).toEqual([
      '제주올레 1코스',
      '제주올레 10코스',
      '제주올레 20코스',
    ]);
    expect(byNumber[7].status).toBe('excluded');
    expect(byNumber[7].osmKm).toBeGreaterThan(12.9 * 1.2);
  });

  it('20코스는 이름이 같은 짧은 조각이 아니라 길이가 맞는 relation을 고른다', () => {
    expect(byNumber[20].candidates.length).toBeGreaterThan(1);
    expect(byNumber[20].relation).toBe(5535857);
  });

  it('경로 밖 짧은 조각을 빼고 끊긴 곳의 개수와 최대 간격을 남긴다', () => {
    expect(byNumber[1].gaps).toBe(0);
    expect(byNumber[10].dropped).toBe(1);
    expect(byNumber[10].gaps).toBeGreaterThan(0);
    expect(byNumber[10].maxGapM).toBeLessThan(600);
    const ten = file.items.find((i) => i.id === 'olle-10');
    expect(ten.gaps).toBe(byNumber[10].gaps);
    expect(ten.maxGapM).toBe(byNumber[10].maxGapM);
  });

  it('좌표는 제주 경계 안, 소수 다섯째 자리, 공식 시작점에서 출발한다', () => {
    for (const it of file.items) {
      for (const [lng, lat] of it.coords) {
        expect(lng).toBeGreaterThan(JEJU_BOUNDS.west);
        expect(lng).toBeLessThan(JEJU_BOUNDS.east);
        expect(lat).toBeGreaterThan(JEJU_BOUNDS.south);
        expect(lat).toBeLessThan(JEJU_BOUNDS.north);
        expect(Math.round(lng * 1e5) / 1e5).toBe(lng);
        expect(Math.round(lat * 1e5) / 1e5).toBe(lat);
      }
      const n = Number(it.id.split('-')[1]);
      const start = raw.official.courses.find((c) => c.number === n).start.lngLat;
      expect(distanceM(it.coords[0], start), it.name).toBeLessThan(
        distanceM(it.coords[it.coords.length - 1], start),
      );
    }
  });

  it('출처는 OSM ODbL, 받은 날짜가 있다', () => {
    expect(file.source).toContain('OpenStreetMap');
    expect(file.source).toContain('ODbL');
    expect(file.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('커밋된 public/data/courses.json과 바이트가 같다(원본만으로 다시 만들 수 있다)', () => {
    expect(readFileSync(OUT, 'utf8')).toBe(serializeCourses(file));
  });
});
