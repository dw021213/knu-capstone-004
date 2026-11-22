import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
  delete window.kakao;
});

interface Doc {
  id: string;
  place_name: string;
  category_name: string;
  road_address_name: string;
  address_name: string;
  x: string;
  y: string;
}

/** 키를 넣고 SDK 스크립트가 실리면 가짜 kakao를 쓰게 한 뒤 모듈을 새로 읽는다 */
async function load(docs: Doc[], total: number) {
  vi.stubEnv('VITE_KAKAO_MAP_JS_KEY', 'test-key');
  const calls: Record<string, unknown>[] = [];
  const keywordSearch = vi.fn(
    (_q: string, cb: (d: Doc[], s: string, p: { totalCount: number }) => void, opts) => {
      calls.push(opts);
      cb(docs, docs.length ? 'OK' : 'ZERO_RESULT', { totalCount: total });
    },
  );
  window.kakao = {
    maps: {
      load: (cb) => cb(),
      LatLng: function () {} as unknown as new (lat: number, lng: number) => unknown,
      LatLngBounds: function () {} as unknown as new (sw: unknown, ne: unknown) => unknown,
      services: {
        Places: function () {
          return { keywordSearch };
        } as unknown as new () => { keywordSearch: typeof keywordSearch },
        Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' },
      },
    },
  };
  const append = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    const el = append(node) as HTMLScriptElement;
    queueMicrotask(() => el.onload?.(new Event('load')));
    return el;
  });
  const mod = await import('./kakao');
  return { ...mod, calls };
}

const doc = (id: string, x: number, y: number, road = '도로명 1'): Doc => ({
  id,
  place_name: `장소 ${id}`,
  category_name: '교통,수송 > 교통시설 > 공항',
  road_address_name: road,
  address_name: '지번 1',
  x: String(x),
  y: String(y),
});

describe('searchKakao', () => {
  it('제주 범위(bounds)와 쪽을 넘겨 묻고, 분류는 마지막 단계, 도로명이 없으면 지번', async () => {
    const { searchKakao, calls } = await load([doc('a', 126.49, 33.5, '')], 1);
    const page = await searchKakao('공항', 2);
    expect(calls[0]).toMatchObject({ size: 15, page: 2 });
    expect(calls[0].bounds).toBeDefined();
    expect(page).toEqual({
      places: [
        { id: 'a', name: '장소 a', category: '공항', address: '지번 1', lat: 33.5, lng: 126.49 },
      ],
      total: 1,
    });
  });

  it('그래도 섞여 온 제주 밖 결과는 버리고 전체 수에서도 뺀다', async () => {
    const { searchKakao } = await load([doc('jeju', 126.49, 33.5), doc('gimpo', 126.8, 37.56)], 2);
    const page = await searchKakao('공항');
    expect(page.places.map((p) => p.id)).toEqual(['jeju']);
    expect(page.total).toBe(1);
  });
});
