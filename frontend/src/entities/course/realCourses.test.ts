// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { roadSourceFromCode, toCellScore } from '../../data/snapshot';
import type { CellScore, CourseFile, ScoresFile } from '../../data/types';
import { segmentCourse } from './segments';
import { sortCourses, summarize } from './summary';

const read = <T>(path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
const courses = read<CourseFile>('../../../public/data/courses.json');
const scoresFile = read<ScoresFile>('../../../public/data/scores.json');
const cells = new Map<string, CellScore>(
  Object.entries(scoresFile.cells).map(([h3, [p, code]]) => [
    h3,
    toCellScore(h3, p, roadSourceFromCode(code)),
  ]),
);
const summaries = courses.items.map((c) =>
  summarize(
    c,
    segmentCourse(c.coords, (h3) => cells.get(h3)?.level ?? null),
  ),
);

describe('배포본 코스 × 배포본 점수', () => {
  it('코스마다 구간 수·코스 등급·주의 구간·데이터 부족 비율(스냅숏)', () => {
    const table = summaries.map((s) => ({
      id: s.course.id,
      segments: s.segments.length,
      level: s.level,
      caution: s.caution.length,
      cautionKm: Math.round(s.cautionKm * 100) / 100,
      noDataPct: Math.round(s.noDataRatio * 100),
    }));
    expect(table).toMatchInlineSnapshot(`
      [
        {
          "caution": 6,
          "cautionKm": 4.14,
          "id": "olle-1",
          "level": 5,
          "noDataPct": 10,
          "segments": 29,
        },
        {
          "caution": 8,
          "cautionKm": 4.67,
          "id": "olle-10",
          "level": 5,
          "noDataPct": 9,
          "segments": 24,
        },
        {
          "caution": 8,
          "cautionKm": 6.57,
          "id": "olle-20",
          "level": 5,
          "noDataPct": 0,
          "segments": 25,
        },
      ]
    `);
  });

  it('구간 km는 0에서 코스 길이까지 끊기지 않고 이어진다', () => {
    for (const s of summaries) {
      expect(s.segments[0].startKm).toBe(0);
      for (let i = 1; i < s.segments.length; i++) {
        expect(s.segments[i].startKm).toBe(s.segments[i - 1].endKm);
      }
      expect(s.segments.at(-1)!.endKm).toBeCloseTo(s.course.lengthKm, 1);
    }
  });

  it('목록 순서(등급 낮은 순, 같으면 주의 구간 짧은 순)', () => {
    expect(sortCourses(summaries).map((s) => s.course.id)).toMatchInlineSnapshot(`
      [
        "olle-1",
        "olle-10",
        "olle-20",
      ]
    `);
  });
});
