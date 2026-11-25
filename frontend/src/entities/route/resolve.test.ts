// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { delay, http, HttpResponse } from 'msw';
import {
  defaultProviders,
  osrmProvider,
  resolveRoute,
  straightProvider,
  walkProvider,
  type LngLat,
} from './resolve';

const OSRM = 'https://osrm.test';
const API = 'https://api.test';
const A: LngLat = [126.52, 33.51];
const B: LngLat = [126.41, 33.45];
const C: LngLat = [126.28, 33.25];
const road: LngLat[] = [A, [126.5, 33.5], [126.45, 33.47], B];

const calls: string[] = [];
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  calls.length = 0;
});
afterAll(() => server.close());

const osrmOk = http.get(`${OSRM}/route/v1/driving/*`, ({ request }) => {
  calls.push(`osrm ${new URL(request.url).pathname}`);
  return HttpResponse.json({ code: 'Ok', routes: [{ geometry: { coordinates: road } }] });
});
const osrmFail = http.get(`${OSRM}/route/v1/driving/*`, () => {
  calls.push('osrm');
  return new HttpResponse(null, { status: 503 });
});
const walkOk = http.get(`${API}/api/walk/route`, ({ request }) => {
  calls.push(`walk ${new URL(request.url).search}`);
  return HttpResponse.json({
    distance_m: 1,
    duration_s: 1,
    paths: [
      [A, B],
      [B, C],
    ],
  });
});
const walk404 = http.get(`${API}/api/walk/route`, () => {
  calls.push('walk');
  return new HttpResponse(null, { status: 404 });
});

const providers = () => [osrmProvider(OSRM), walkProvider(API), straightProvider];

describe('resolveRoute', () => {
  it('OSRM이 되면 OSRM 도로 경로', async () => {
    server.use(osrmOk, walkOk);
    const r = await resolveRoute([A, B], providers());
    expect(r).toEqual({ coords: road, via: 'osrm' });
    expect(calls).toEqual([`osrm /route/v1/driving/${A.join(',')};${B.join(',')}`]);
  });

  it('OSRM이 실패하면 도보 API, 경유지는 | 로 잇는다', async () => {
    server.use(osrmFail, walkOk);
    const r = await resolveRoute([A, B, C], providers());
    expect(r.via).toBe('walk');
    expect(r.coords).toEqual([A, B, B, C]);
    const q = new URLSearchParams(calls[1].slice('walk '.length));
    expect(calls[0]).toBe('osrm');
    expect(q.get('origin')).toBe(A.join(','));
    expect(q.get('destination')).toBe(C.join(','));
    expect(q.get('waypoints')).toBe(B.join(','));
  });

  it('둘 다 실패하면(도보 API 404) 직선 연결', async () => {
    server.use(osrmFail, walk404);
    const r = await resolveRoute([A, B, C], providers());
    expect(r).toEqual({ coords: [A, B, C], via: 'straight' });
    expect(calls).toEqual(['osrm', 'walk']);
  });

  it('OSRM이 Ok가 아닌 코드나 빈 경로를 주면 실패로 본다', async () => {
    server.use(
      http.get(`${OSRM}/route/v1/driving/*`, () => HttpResponse.json({ code: 'NoRoute' })),
      walk404,
    );
    expect((await resolveRoute([A, B], providers())).via).toBe('straight');
  });

  it('제공자가 시간 안에 답하지 않으면 다음으로 넘어간다', async () => {
    server.use(
      http.get(`${OSRM}/route/v1/driving/*`, async () => {
        await delay(500);
        return HttpResponse.json({ code: 'Ok', routes: [{ geometry: { coordinates: road } }] });
      }),
      walkOk,
    );
    const r = await resolveRoute([A, B], providers(), 50);
    expect(r.via).toBe('walk');
  });

  it('API 주소가 없으면 도보 API를 건너뛴다', async () => {
    server.use(osrmFail);
    const r = await resolveRoute([A, B], [osrmProvider(OSRM), walkProvider(''), straightProvider]);
    expect(r.via).toBe('straight');
    expect(calls).toEqual(['osrm']);
  });

  it('장소가 7곳을 넘으면 도보 API를 건너뛴다(경유지 5곳 제한)', async () => {
    server.use(osrmFail, walkOk);
    const eight = Array.from({ length: 8 }, (_, i) => [126.3 + i * 0.05, 33.4] as LngLat);
    expect((await resolveRoute(eight, providers())).via).toBe('straight');
    expect(calls).toEqual(['osrm']);
    calls.length = 0;
    expect((await resolveRoute(eight.slice(0, 7), providers())).via).toBe('walk');
  });

  it('장소가 2곳보다 적으면 아무것도 부르지 않는다', async () => {
    expect(await resolveRoute([A], providers())).toEqual({ coords: [A], via: 'straight' });
    expect(await resolveRoute([], providers())).toEqual({ coords: [], via: 'straight' });
    expect(calls).toEqual([]);
  });

  it('앱 순서는 OSRM → 도보 → 직선', () => {
    expect(defaultProviders({ VITE_API_BASE: API }).map((p) => p.via)).toEqual([
      'osrm',
      'walk',
      'straight',
    ]);
  });
});
