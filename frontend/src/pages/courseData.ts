import { useMemo } from 'react';
import { queryOptions, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CellScore, Course, DataSource } from '../data/types';
import { COURSE_KINDS, type CourseKind } from '../entities/course/kinds';
import { segmentCourse } from '../entities/course/segments';
import { summarize, type CourseSummary } from '../entities/course/summary';
import {
  EXAMPLE_COURSES,
  EXAMPLE_SOURCES,
  findExample,
  type ExampleCourse,
} from '../entities/course/examples';
import type { MyCourse, Stop } from '../entities/my-course/store';
import { useMyCourses } from '../entities/my-course/useMyCourses';
import {
  defaultProviders,
  resolveRoute,
  type LngLat,
  type ResolvedRoute,
} from '../entities/route/resolve';
import { distanceMeters } from '../shared/geo/distance';
import type {
  CourseDetailState,
  CourseListItem,
  CourseListState,
  CourseView,
  Loadable,
  SourceNote,
} from '../features/course/view';
import { VIA_TEXT } from '../features/course/via';
import { OSM_COPYRIGHT } from '../features/course/links';
import { useScores } from './useScores';

type Cells = ReadonlyMap<string, CellScore>;

/** 두 종류가 같은 입력({ id, name, coords, lengthKm })으로 구간과 주의할 구간 묶음을 낸다 */
function summarizeCourse(c: Course, cells: Cells): CourseSummary {
  return summarize(
    c,
    segmentCourse(c.coords, (h3) => cells.get(h3)?.level ?? null),
  );
}

/**
 * 코스 자료 질의와 점수(지도 홈과 같은 캐시, api 모드는 고른 날짜 기준)를 함께 기다린다.
 * build는 둘이 바뀔 때만 다시 돈다(경로를 촘촘히 하는 계산이 무겁다)
 */
function useScored<T extends { status: 'ready' | 'pending' }, R extends object>(
  query: UseQueryResult<T>,
  source: DataSource,
  build: (data: T, cells: Cells) => R,
  /** build가 자료·점수 말고 더 기대는 값(상세의 코스 id) */
  key = '',
): Loadable<R> {
  const scores = useScores(source);
  const built = useMemo(
    () => (query.data && scores.data ? build(query.data, scores.data.cells) : null),
    // build는 화면마다 새로 만들어지지만 결과는 자료·점수·key로만 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, scores.data, key],
  );
  const failed = (query.isError && !query.isFetching) || (scores.isError && !scores.isFetching);
  if (failed) {
    return {
      status: 'error',
      retry: () => {
        if (query.isError) void query.refetch();
        if (scores.isError) void scores.refetch();
      },
    };
  }
  if (!query.data || !built) return { status: 'loading' };
  if (query.data.status === 'pending') return { status: 'pending' };
  return { status: 'ready', ...built };
}

const olleQuery = (source: DataSource, enabled: boolean) => ({
  queryKey: ['courses', source.mode],
  queryFn: () => source.getCourses(),
  retry: false,
  enabled,
});

/** 올레 코스는 자료 순서(코스 번호) 그대로. 위험한 정도로 줄 세우지 않는다 */
export function olleItems(items: Course[], cells: Cells) {
  return items.map((c): CourseListItem => ({
    summary: summarizeCourse(c, cells),
    href: COURSE_KINDS.olle.href(c.id),
    meta: [],
  }));
}

export function useOlleList(source: DataSource, enabled = true): CourseListState {
  const q = useQuery(olleQuery(source, enabled));
  return useScored(q, source, (data, cells) => ({
    items: olleItems(data.items, cells),
    source: { label: '경로', text: data.source, href: OSM_COPYRIGHT },
  }));
}

function olleView(data: { source: string; items: Course[] }, id: string, cells: Cells) {
  const course = data.items.find((c) => c.id === id);
  if (!course) return null;
  return {
    kind: 'olle',
    summary: summarizeCourse(course, cells),
    stops: null,
    via: null,
    sources: [`경로: ${data.source}`],
    subtitle: null,
    note: null,
  } satisfies CourseView;
}

function asDetail(state: Loadable<{ view: CourseView | null }>): CourseDetailState {
  if (state.status !== 'ready') return state;
  return state.view ? { status: 'ready', view: state.view } : { status: 'missing' };
}

/** /courses/:id 상세(올레). id가 올레 코스가 아니면 없는 코스 */
export function useCatalogDetail(source: DataSource, id: string, kind: CourseKind | null) {
  const olle = useScored(
    useQuery(olleQuery(source, kind === 'olle')),
    source,
    (data, cells) => ({ view: olleView(data, id, cells) }),
    id,
  );
  if (kind === 'olle') return asDetail(olle);
  return { status: 'missing' } satisfies CourseDetailState;
}

// ---- 장소를 이어 만드는 코스(내 코스, 예시 코스) ----

const PROVIDERS = defaultProviders(import.meta.env);

type Point = Pick<Stop, 'lat' | 'lng'>;

/** 장소 목록으로 이루어진 코스. 내 코스와 예시 코스가 같은 모양이다 */
interface StopCourse {
  id: string;
  name: string;
  stops: readonly (Point & { name: string; id?: string })[];
}

const toPoints = (stops: readonly Point[]): LngLat[] => stops.map((s) => [s.lng, s.lat]);

/** 장소 좌표 목록을 키로 경로를 캐시한다. 직선 연결(길찾기 실패)은 다음에 다시 시도하도록 바로 낡게 둔다 */
export function routeQuery(stops: readonly Point[]) {
  const points = toPoints(stops);
  return queryOptions({
    queryKey: ['route', points.map((p) => p.join(',')).join(';')],
    queryFn: () => resolveRoute(points, PROVIDERS),
    retry: false,
    staleTime: (q) => (q.state.data?.via === 'straight' ? 0 : Infinity),
    enabled: points.length >= 2,
  });
}

function lineKm(coords: LngLat[]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distanceMeters(coords[i - 1], coords[i]);
  return m / 1000;
}

/** 내 코스 + 이은 경로 → 요약 계산 입력 */
export function myCourseInput(course: Pick<MyCourse, 'id' | 'name'>, route: ResolvedRoute): Course {
  return { id: course.id, name: course.name, coords: route.coords, lengthKm: lineKm(route.coords) };
}

export function summarizeMine(
  course: Pick<MyCourse, 'id' | 'name'>,
  route: ResolvedRoute,
  cells: Cells,
): CourseSummary {
  return summarizeCourse(myCourseInput(course, route), cells);
}

/** 종류마다 다른 상세 내용: 출처 칩, 부제, 메모 */
type ViewExtra = Pick<CourseView, 'sources' | 'subtitle' | 'note'>;

function stopView(
  kind: CourseKind,
  course: StopCourse,
  route: ResolvedRoute,
  cells: Cells,
  extra: (via: ResolvedRoute['via']) => ViewExtra,
): CourseView {
  return {
    kind,
    summary: summarizeMine(course, route, cells),
    via: route.via,
    stops: course.stops.map((s, i) => ({
      key: s.id ?? `${i}`,
      name: s.name,
      lngLat: [s.lng, s.lat],
    })),
    ...extra(route.via),
  };
}

const mineExtra = (course: MyCourse) => (via: ResolvedRoute['via']) => {
  const sources = [VIA_TEXT[via].source];
  if (course.stops.some((s) => s.source === 'kakao')) sources.push('장소: 카카오 로컬 검색');
  return { sources, subtitle: null, note: null };
};

const exampleExtra = (course: ExampleCourse) => (via: ResolvedRoute['via']) => ({
  sources: [VIA_TEXT[via].source, ...EXAMPLE_SOURCES],
  subtitle: course.dayTitle,
  note: course.note,
});

/** 질의 결과 배열에서 data만. 모듈 함수라 combine 결과가 결과가 바뀔 때만 새로 만들어진다 */
const dataOf = (rs: UseQueryResult<ResolvedRoute>[]) => rs.map((r) => r.data);

/** 코스마다 경로를 이어 목록 줄을 만든다(주어진 순서 그대로) */
function useStopList(
  source: DataSource,
  kind: CourseKind,
  courses: readonly StopCourse[],
  enabled: boolean,
): Loadable<{ items: CourseListItem[] }> {
  const datas = useQueries({
    queries: courses.map((c) => ({
      ...routeQuery(c.stops),
      enabled: enabled && c.stops.length >= 2,
    })),
    combine: dataOf,
  });
  const scores = useScores(source);
  const cells = scores.data?.cells;
  const items = useMemo(() => {
    if (!cells || datas.some((d, i) => !d && courses[i].stops.length >= 2)) return null;
    return courses.map((c, i): CourseListItem => {
      const route = datas[i] ?? { coords: toPoints(c.stops), via: 'straight' as const };
      return {
        summary: summarizeMine(c, route, cells),
        href: COURSE_KINDS[kind].href(c.id),
        meta: [
          `장소 ${c.stops.length}곳`,
          ...(route.via === 'straight' ? [VIA_TEXT.straight.short] : []),
        ],
      };
    });
  }, [courses, cells, datas, kind]);
  if (scores.isError && !scores.isFetching)
    return { status: 'error', retry: () => void scores.refetch() };
  if (!items) return { status: 'loading' };
  return { status: 'ready', items };
}

/** 최근에 고친 코스부터 */
const byRecent = (a: MyCourse, b: MyCourse) => b.updatedAt.localeCompare(a.updatedAt);

export function useMineList(source: DataSource, enabled = true): CourseListState {
  const courses = useMyCourses();
  const sorted = useMemo(() => [...courses].sort(byRecent), [courses]);
  const state = useStopList(source, 'mine', sorted, enabled);
  return state.status === 'ready' ? { ...state, source: null } : state;
}

const EXAMPLE_NOTE: SourceNote = { label: '장소', text: '카카오 로컬 검색(2026-11-23)' };

/** 예시 코스는 표에 실은 순서 그대로 */
export function useExampleList(source: DataSource, enabled = true): CourseListState {
  const state = useStopList(source, 'example', EXAMPLE_COURSES, enabled);
  return state.status === 'ready' ? { ...state, source: EXAMPLE_NOTE } : state;
}

/** 장소 코스 상세: 경로를 잇고 구간을 낸다. 코스가 없으면 없는 코스 */
function useStopDetail<C extends StopCourse>(
  source: DataSource,
  course: C | null,
  build: (course: C, route: ResolvedRoute, cells: Cells) => CourseView,
): CourseDetailState {
  const route = useQuery({
    ...routeQuery(course?.stops ?? []),
    enabled: (course?.stops.length ?? 0) >= 2,
  });
  const scores = useScores(source);
  const cells = scores.data?.cells;
  const view = useMemo(() => {
    if (!course || !cells) return null;
    const r =
      route.data ??
      (course.stops.length < 2
        ? { coords: toPoints(course.stops), via: 'straight' as const }
        : null);
    return r ? build(course, r, cells) : null;
    // build는 화면마다 새로 만들어지지만 결과는 코스·경로·점수로만 정해진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, cells, route.data]);
  if (!course) return { status: 'missing' };
  if (scores.isError && !scores.isFetching)
    return { status: 'error', retry: () => void scores.refetch() };
  if (!view) return { status: 'loading' };
  return { status: 'ready', view };
}

export function useMineDetail(source: DataSource, id: string): CourseDetailState {
  const course = useMyCourses().find((c) => c.id === id) ?? null;
  return useStopDetail(source, course, (c, route, cells) =>
    stopView('mine', c, route, cells, mineExtra(c)),
  );
}

export function useExampleDetail(source: DataSource, id: string): CourseDetailState {
  return useStopDetail(source, findExample(id), (c, route, cells) =>
    stopView('example', c, route, cells, exampleExtra(c)),
  );
}

/** 만드는 중인 코스 미리 보기: 이은 경로와 구간 등급. 장소가 2곳보다 적으면 둘 다 null */
export function useDraftPreview(source: DataSource, stops: readonly Stop[]) {
  const route = useQuery(routeQuery(stops));
  const cells = useScores(source).data?.cells;
  const data = stops.length >= 2 ? (route.data ?? null) : null;
  const summary = useMemo(
    () => (data && cells ? summarizeMine({ id: 'draft', name: '' }, data, cells) : null),
    [data, cells],
  );
  return { route: data, summary, finding: stops.length >= 2 && route.isFetching };
}
