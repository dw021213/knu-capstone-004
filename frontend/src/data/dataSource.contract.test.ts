// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { levelFromPercentile } from '../entities/risk/level';
import { createSnapshotSource } from './snapshot';
import { createApiSource } from './api';
import { selectDataSource } from './index';
import type { DataSource, RoadSource } from './types';
import {
  API_BASE,
  FIXTURE_CELLS,
  FIXTURE_DATASET_ID,
  SNAPSHOT_BASE,
  TRAP_RISK_PERCENTILE,
  TRAP_SCORE_ONE,
  gridJson,
  handlers,
  seen,
  snapshotScoresJson,
} from './mocks/backend';

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  seen.gridUrl = null;
});
afterAll(() => server.close());

const ROAD: Record<0 | 1 | 2, RoadSource> = { 0: 'none', 1: 'standard_link', 2: 'ngii_map' };

const makeSnapshot = (): DataSource => createSnapshotSource(SNAPSHOT_BASE);
const makeApi = (): DataSource => createApiSource(API_BASE, SNAPSHOT_BASE);

describe.each([
  ['snapshot', makeSnapshot],
  ['api', makeApi],
] as const)('DataSource 계약: %s', (mode, make) => {
  it('모드 이름', () => {
    expect(make().mode).toBe(mode);
  });

  it('셀이 1개 이상이고 데이터 버전이 있다', async () => {
    const scores = await make().getScores();
    expect(scores.cells.size).toBeGreaterThan(0);
    expect(scores.datasetId).toBe(FIXTURE_DATASET_ID);
  });

  it('백분위가 없는 셀은 level null, status no_data', async () => {
    const { cells } = await make().getScores();
    const empty = [...cells.values()].filter((c) => c.percentile === null);
    expect(empty.length).toBeGreaterThan(0);
    for (const c of empty) {
      expect(c.level).toBeNull();
      expect(c.status).toBe('no_data');
    }
  });

  it('등급은 levelFromPercentile과 같고, 백분위가 있으면 status ok', async () => {
    const { cells } = await make().getScores();
    for (const c of cells.values()) {
      expect(c.level).toBe(levelFromPercentile(c.percentile));
      if (c.percentile !== null) expect(c.status).toBe('ok');
    }
  });

  it('고정 셀 10개가 교통 모델 백분위·도로 출처 그대로 나온다', async () => {
    const { cells } = await make().getScores();
    expect(cells.size).toBe(FIXTURE_CELLS.length);
    for (const [h3, p, code] of FIXTURE_CELLS) {
      expect(cells.get(h3)).toEqual({
        h3,
        percentile: p,
        level: levelFromPercentile(p),
        roadSource: ROAD[code],
        status: p === null ? 'no_data' : 'ok',
      });
    }
  });

  it("getPoi('fire')가 status를 가진다", async () => {
    const layer = await make().getPoi('fire');
    expect(layer.type).toBe('fire');
    expect(['ready', 'pending']).toContain(layer.status);
    expect(Array.isArray(layer.items)).toBe(true);
  });

  it('아직 없는 시설 파일은 pending과 빈 목록', async () => {
    const layer = await make().getPoi('cctv');
    expect(layer).toMatchObject({ type: 'cctv', status: 'pending', items: [] });
  });

  it('아직 없는 코스 파일은 pending과 빈 목록', async () => {
    const courses = await make().getCourses();
    expect(courses).toMatchObject({ status: 'pending', items: [] });
  });
});

describe('snapshot 구현', () => {
  it('점수 파일의 생성 시각을 싣는다', async () => {
    expect((await makeSnapshot().getScores()).generatedAt).toBe(snapshotScoresJson.generatedAt);
  });

  it('날씨는 반영하지 않는다(off)', async () => {
    expect((await makeSnapshot().getScores({ at: '2026-10-19T09:00' })).weather).toBe('off');
  });

  it('시설 파일이 있으면 ready와 항목', async () => {
    const layer = await makeSnapshot().getPoi('fire');
    expect(layer.status).toBe('ready');
    expect(layer.items[0]).toMatchObject({ type: 'fire', name: '구좌119안전센터' });
  });

  it('파일 안의 status가 pending이면 pending과 그 출처 문구', async () => {
    server.use(
      http.get(`${SNAPSHOT_BASE}/data/poi/lodging.json`, () =>
        HttpResponse.json({
          type: 'lodging',
          status: 'pending',
          source: '로그인이 필요해 내려받지 못함',
          items: [],
        }),
      ),
    );
    expect(await makeSnapshot().getPoi('lodging')).toEqual({
      type: 'lodging',
      status: 'pending',
      source: '로그인이 필요해 내려받지 못함',
      items: [],
    });
  });

  it('파일 안의 status가 ready면 ready', async () => {
    server.use(
      http.get(`${SNAPSHOT_BASE}/data/poi/police.json`, () =>
        HttpResponse.json({
          type: 'police',
          status: 'ready',
          source: '경찰청',
          fetchedAt: '2026-10-17',
          items: [{ id: 'police-1', type: 'police', name: '중앙지구대', lat: 33.5, lng: 126.5 }],
        }),
      ),
    );
    const layer = await makeSnapshot().getPoi('police');
    expect(layer.status).toBe('ready');
    expect(layer.items).toHaveLength(1);
  });

  it('없는 파일에 HTML(SPA 폴백)이 200으로 와도 pending', async () => {
    server.use(
      http.get(
        `${SNAPSHOT_BASE}/data/poi/lodging.json`,
        () =>
          new HttpResponse('<!doctype html><html></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    expect(await makeSnapshot().getPoi('lodging')).toMatchObject({
      status: 'pending',
      items: [],
    });
  });

  it('코스 파일이 있으면 ready와 코스', async () => {
    server.use(
      http.get(`${SNAPSHOT_BASE}/data/courses.json`, () =>
        HttpResponse.json({
          source: 'OpenStreetMap',
          items: [
            { id: 'olle-1', name: '제주올레 1코스', lengthKm: 15.1, coords: [[126.9, 33.4]] },
          ],
        }),
      ),
    );
    const courses = await makeSnapshot().getCourses();
    expect(courses.status).toBe('ready');
    expect(courses.items[0].name).toBe('제주올레 1코스');
  });

  it('점수 파일을 못 받으면 실패한다', async () => {
    server.use(
      http.get(`${SNAPSHOT_BASE}/data/scores.json`, () => new HttpResponse(null, { status: 500 })),
    );
    await expect(makeSnapshot().getScores()).rejects.toThrow();
  });
});

describe('api 구현', () => {
  it('함정 셀: 최종 점수 1이어도 교통 모델 백분위가 없으면 데이터 부족', async () => {
    const { cells } = await makeApi().getScores();
    expect(cells.get(TRAP_SCORE_ONE)).toMatchObject({
      percentile: null,
      level: null,
      status: 'no_data',
      roadSource: 'none',
    });
  });

  it('함정 셀: 유동인구를 켠 백분위가 있어도 읽지 않는다', async () => {
    const { cells } = await makeApi().getScores();
    expect(cells.get(TRAP_RISK_PERCENTILE)).toMatchObject({
      percentile: null,
      level: null,
      status: 'no_data',
    });
  });

  it('유동인구를 켠 값이 아니라 교통 모델 백분위로 등급을 매긴다', async () => {
    const { cells } = await makeApi().getScores();
    expect(cells.get('8830d02011fffff')).toMatchObject({ percentile: 3.6, level: 1 });
  });

  it('날씨를 켜고 부르며, at을 주면 요청에 싣는다', async () => {
    await makeApi().getScores({ at: '2026-10-19T09:00' });
    expect(seen.gridUrl?.searchParams.get('weather')).toBe('on');
    expect(seen.gridUrl?.searchParams.get('at')).toBe('2026-10-19T09:00');
  });

  it('at이 없으면 at 파라미터를 싣지 않는다', async () => {
    await makeApi().getScores();
    expect(seen.gridUrl?.searchParams.has('at')).toBe(false);
  });

  it.each([
    ['ok', 'on'],
    ['no_data', 'no_data'],
    ['off', 'off'],
  ] as const)('weather.status %s → %s', async (status, expected) => {
    server.use(http.get(`${API_BASE}/api/grid`, () => HttpResponse.json(gridJson(status))));
    expect((await makeApi().getScores()).weather).toBe(expected);
  });

  it('119는 백엔드 /api/facilities에서 받는다', async () => {
    const layer = await makeApi().getPoi('fire');
    expect(layer.status).toBe('ready');
    expect(layer.items).toEqual([
      {
        id: 'fire-1',
        type: 'fire',
        name: '구좌119안전센터',
        lat: 33.52037,
        lng: 126.86019,
        detail: { address: '제주 제주시 구좌읍 세화14길 8' },
      },
    ]);
  });

  it('스냅숏 파일을 못 받아도 격자는 그리고, 도로 있는 셀은 표준노드링크로 둔다', async () => {
    server.use(
      http.get(`${SNAPSHOT_BASE}/data/scores.json`, () => new HttpResponse(null, { status: 500 })),
    );
    const scores = await makeApi().getScores();
    expect(scores.datasetId).toBe('');
    expect(scores.cells.size).toBe(FIXTURE_CELLS.length);
    expect(scores.cells.get('8830d10c49fffff')).toMatchObject({
      roadSource: 'standard_link',
      level: 5,
    });
    expect(scores.cells.get(TRAP_SCORE_ONE)?.roadSource).toBe('none');
  });

  it('격자 요청이 실패하면 실패한다', async () => {
    server.use(http.get(`${API_BASE}/api/grid`, () => new HttpResponse(null, { status: 500 })));
    await expect(makeApi().getScores()).rejects.toThrow();
  });
});

describe('모드 선택', () => {
  it('기본은 snapshot', () => {
    expect(selectDataSource({}).mode).toBe('snapshot');
  });

  it('VITE_DATA_MODE=api면 api', () => {
    expect(selectDataSource({ VITE_DATA_MODE: 'api', VITE_API_BASE: API_BASE }).mode).toBe('api');
  });
});
