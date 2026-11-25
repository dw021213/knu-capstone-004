import { JEJU_BOUNDS } from '../map/projection';

// 카카오 지도는 띄우지 않는다(우리 지도는 d3 canvas). 장소 검색(services.Places)만 쓰려고 SDK를 처음 검색할 때 한 번 불러온다.
// 카카오 JS 키는 등록한 도메인에서만 동작해서, 키가 없거나 SDK·검색이 실패하면 이번 접속 동안은 다시 시도하지 않는다.

export interface KakaoPlace {
  id: string;
  name: string;
  /** 분류의 마지막 단계(예: 공항) */
  category: string;
  /** 도로명 주소, 없으면 지번 주소 */
  address: string;
  lat: number;
  lng: number;
}

export interface KakaoPage {
  places: KakaoPlace[];
  /** 제주 범위 안 결과 수. 카카오 SDK는 넘겨 줄 수 있는 앞 45건까지만 센다 */
  total: number;
}

/** 한 쪽 결과 수(카카오 최대) */
export const KAKAO_PAGE_SIZE = 15;
/** 카카오가 넘겨 주는 마지막 쪽(15건 × 3쪽 = 45건) */
export const KAKAO_MAX_PAGE = 3;

/** off: 키 없음, idle: 아직 안 불러옴, ready: 검색 됨, failed: SDK나 검색이 실패함 */
export type KakaoStatus = 'off' | 'idle' | 'ready' | 'failed';

interface KakaoDoc {
  id: string;
  place_name: string;
  category_name?: string;
  address_name?: string;
  road_address_name?: string;
  x: string;
  y: string;
}

interface KakaoPlaces {
  keywordSearch(
    query: string,
    cb: (data: KakaoDoc[], status: string, pagination?: { totalCount: number }) => void,
    opts?: Record<string, unknown>,
  ): void;
}

interface KakaoGlobal {
  maps: {
    load(cb: () => void): void;
    LatLng: new (lat: number, lng: number) => unknown;
    LatLngBounds: new (sw: unknown, ne: unknown) => unknown;
    services: {
      Places: new () => KakaoPlaces;
      Status: { OK: string; ZERO_RESULT: string; ERROR: string };
    };
  };
}

declare global {
  interface Window {
    kakao?: KakaoGlobal;
  }
}

const KEY = import.meta.env.VITE_KAKAO_MAP_JS_KEY ?? '';
/** SDK 불러오기와 검색 한 번에 기다리는 시간 */
const TIMEOUT_MS = 6000;

let status: KakaoStatus = KEY ? 'idle' : 'off';
let sdk: Promise<KakaoGlobal> | null = null;
const listeners = new Set<() => void>();

function setStatus(s: KakaoStatus) {
  if (status === s) return;
  status = s;
  for (const l of listeners) l();
}

export const kakaoStatus = () => status;

export function subscribeKakao(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function timeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} 시간 초과`)), TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function loadSdk(): Promise<KakaoGlobal> {
  sdk ??= timeout(
    new Promise<KakaoGlobal>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=${encodeURIComponent(KEY)}`;
      script.async = true;
      script.onerror = () => reject(new Error('카카오 SDK를 불러오지 못했어요'));
      script.onload = () => {
        const k = window.kakao;
        if (!k?.maps?.load) return reject(new Error('카카오 SDK 모양이 달라요'));
        k.maps.load(() => resolve(k));
      };
      document.head.appendChild(script);
    }),
    '카카오 SDK',
  );
  return sdk;
}

const inJeju = (lat: number, lng: number) =>
  lat >= JEJU_BOUNDS.south &&
  lat <= JEJU_BOUNDS.north &&
  lng >= JEJU_BOUNDS.west &&
  lng <= JEJU_BOUNDS.east;

/**
 * 카카오 장소 검색 page쪽(15건). 제주 범위(bounds)로 묻고, 그래도 섞여 오는 제주 밖 결과는 버린다.
 * 키가 없거나 앞서 실패했으면 빈 결과
 */
export async function searchKakao(query: string, page = 1): Promise<KakaoPage> {
  const q = query.trim();
  if (!q || status === 'off' || status === 'failed') return { places: [], total: 0 };
  try {
    const k = await loadSdk();
    const { docs, total } = await timeout(
      new Promise<{ docs: KakaoDoc[]; total: number }>((resolve, reject) => {
        const { Status, Places } = k.maps.services;
        const bounds = new k.maps.LatLngBounds(
          new k.maps.LatLng(JEJU_BOUNDS.south, JEJU_BOUNDS.west),
          new k.maps.LatLng(JEJU_BOUNDS.north, JEJU_BOUNDS.east),
        );
        new Places().keywordSearch(
          q,
          (data, st, pagination) => {
            if (st === Status.OK)
              resolve({ docs: data, total: pagination?.totalCount ?? data.length });
            else if (st === Status.ZERO_RESULT) resolve({ docs: [], total: 0 });
            else reject(new Error(`카카오 검색 ${st}`));
          },
          { bounds, size: KAKAO_PAGE_SIZE, page },
        );
      }),
      '카카오 검색',
    );
    setStatus('ready');
    const places = docs
      .map((d) => ({
        id: d.id,
        name: d.place_name,
        category: d.category_name?.split('>').pop()?.trim() ?? '',
        address: d.road_address_name || d.address_name || '',
        lat: Number(d.y),
        lng: Number(d.x),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && inJeju(p.lat, p.lng));
    return { places, total: Math.max(total - (docs.length - places.length), places.length) };
  } catch {
    setStatus('failed');
    return { places: [], total: 0 };
  }
}
