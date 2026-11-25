/** 장소를 무엇으로 이었는지. 화면에 그대로 밝힌다 */
export type RouteVia = 'osrm' | 'walk' | 'straight';

export type LngLat = [number, number];

export interface ResolvedRoute {
  /** [경도, 위도] */
  coords: LngLat[];
  via: RouteVia;
}

export interface RouteProvider {
  via: RouteVia;
  /** 이 장소 목록에 쓸 수 있는지(경유지 수 제한, 주소 설정 등). false면 부르지 않고 넘어간다 */
  accepts(points: readonly LngLat[]): boolean;
  route(points: readonly LngLat[], signal: AbortSignal): Promise<LngLat[]>;
}

/** 제공자 하나가 이보다 오래 걸리면 다음으로 넘어간다 */
export const PROVIDER_TIMEOUT_MS = 6000;

const isLngLat = (v: unknown): v is LngLat =>
  Array.isArray(v) &&
  v.length >= 2 &&
  typeof v[0] === 'number' &&
  typeof v[1] === 'number' &&
  Number.isFinite(v[0]) &&
  Number.isFinite(v[1]);

function asLine(v: unknown): LngLat[] {
  if (!Array.isArray(v)) throw new Error('경로 좌표가 아니에요');
  const line = v.filter(isLngLat).map(([lng, lat]) => [lng, lat] as LngLat);
  if (line.length < 2) throw new Error('경로 좌표가 모자라요');
  return line;
}

const pair = ([lng, lat]: LngLat) => `${lng},${lat}`;

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${new URL(url).pathname} 응답 ${res.status}`);
  return res.json();
}

/** 공개 OSRM 자동차 길찾기(router.project-osrm.org). 도보 길이 아니라 자동차 도로를 따른다 */
export function osrmProvider(base = 'https://router.project-osrm.org'): RouteProvider {
  return {
    via: 'osrm',
    accepts: (points) => points.length >= 2,
    async route(points, signal) {
      const url = `${base}/route/v1/driving/${points.map(pair).join(';')}?overview=full&geometries=geojson`;
      const body = (await getJson(url, signal)) as {
        code?: string;
        routes?: { geometry?: { coordinates?: unknown } }[];
      };
      if (body.code !== 'Ok') throw new Error(`OSRM ${body.code ?? '응답 없음'}`);
      return asLine(body.routes?.[0]?.geometry?.coordinates);
    },
  };
}

/** 백엔드 도보 길찾기(카카오 도보 경로 중계). 경유지 5곳(장소 7곳)까지 */
export const WALK_MAX_POINTS = 7;

export function walkProvider(apiBase: string | undefined): RouteProvider {
  return {
    via: 'walk',
    accepts: (points) => Boolean(apiBase) && points.length >= 2 && points.length <= WALK_MAX_POINTS,
    async route(points, signal) {
      const params = new URLSearchParams({
        origin: pair(points[0]),
        destination: pair(points[points.length - 1]),
      });
      const via = points.slice(1, -1);
      if (via.length > 0) params.set('waypoints', via.map(pair).join('|'));
      const body = (await getJson(`${apiBase}/api/walk/route?${params}`, signal)) as {
        paths?: unknown;
      };
      if (!Array.isArray(body.paths)) throw new Error('도보 경로가 없어요');
      return asLine(body.paths.flatMap((p) => (Array.isArray(p) ? p : [])));
    },
  };
}

/** 장소를 순서대로 직선으로 잇는다(마지막 수단, 실패하지 않는다) */
export const straightProvider: RouteProvider = {
  via: 'straight',
  accepts: () => true,
  route: async (points) => points.map(([lng, lat]) => [lng, lat] as LngLat),
};

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('시간 초과')), ms);
  return run(ctl.signal).finally(() => clearTimeout(timer));
}

/**
 * 제공자를 순서대로 시도해 처음 성공한 경로를 쓴다. 모두 실패하면 직선으로 잇는다.
 * 장소가 2곳보다 적으면 그 점들을 그대로 돌려준다
 */
export async function resolveRoute(
  points: readonly LngLat[],
  providers: readonly RouteProvider[],
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<ResolvedRoute> {
  if (points.length >= 2) {
    for (const p of providers) {
      if (!p.accepts(points)) continue;
      try {
        return { coords: await withTimeout((s) => p.route(points, s), timeoutMs), via: p.via };
      } catch {
        // 다음 제공자로
      }
    }
  }
  return {
    coords: await straightProvider.route(points, new AbortController().signal),
    via: 'straight',
  };
}

/** 앱이 쓰는 순서: OSRM → 도보 API(VITE_API_BASE가 있을 때) → 직선 */
export function defaultProviders(env: { VITE_API_BASE?: string }): RouteProvider[] {
  return [osrmProvider(), walkProvider(env.VITE_API_BASE), straightProvider];
}
