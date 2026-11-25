import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { dataSource, type DataSource } from '../data';
import { exampleStops, findExample, type ExampleCourse } from '../entities/course/examples';
import { COURSE_KINDS, tabHref } from '../entities/course/kinds';
import { EMD_QUERY_KEY, fetchEmd, placeAt } from '../entities/place/emd';
import { MAX_STOPS, deleteCourse, newId, saveCourse, type Stop } from '../entities/my-course/store';
import {
  addBlock,
  addStop,
  moveStop,
  removeStop,
  samePlace,
  stopRole,
} from '../entities/my-course/stops';
import { useMyCourses } from '../entities/my-course/useMyCourses';
import { PageBar } from '../features/course/PageBar';
import { courseFocus, courseRoute, pointFocus } from '../features/course/route';
import { VIA_TEXT } from '../features/course/via';
import { MapView, type MapFocus, type MapPin, type MapReveal } from '../features/map/MapView';
import { JEJU_BOUNDS } from '../features/map/projection';
import { ISLAND_BOUNDS } from '../features/map/view';
import type { Candidate } from '../features/search/localSearch';
import { LETTERS, PlaceCard, SearchResults } from '../features/search/SearchResults';
import {
  IDLE,
  searchReducer,
  type SearchAction,
  type SearchState,
} from '../features/search/searchState';
import { StopSearch } from '../features/search/StopSearch';
import { useKakaoOn, useResults, useSuggestions } from '../features/search/usePlaceSearch';
import { usePageTitle } from '../shared/page/usePageTitle';
import { CourseDetailScreen } from './CourseDetailPage';
import { useDraftPreview, useExampleDetail, useMineDetail } from './courseData';
import { useRightInset } from './useRightInset';
import { useScores } from './useScores';
import detail from './CourseDetailPage.module.css';
import styles from './MyCoursePages.module.css';

const LIST = tabHref('mine');

const ISLAND_CORNERS: [number, number][] = [
  [ISLAND_BOUNDS.west, ISLAND_BOUNDS.south],
  [ISLAND_BOUNDS.east, ISLAND_BOUNDS.north],
];

const inJeju = ([lng, lat]: [number, number]) =>
  lng >= JEJU_BOUNDS.west &&
  lng <= JEJU_BOUNDS.east &&
  lat >= JEJU_BOUNDS.south &&
  lat <= JEJU_BOUNDS.north;

/** 서버 없이 찾는 장소: 읍면동 */
function useLocalCandidates(): Candidate[] {
  const emd = useQuery({ queryKey: EMD_QUERY_KEY, queryFn: fetchEmd });
  return useMemo(
    () =>
      (emd.data?.items ?? []).map((it): Candidate => ({
        key: `emd-${it.code}`,
        name: it.name,
        category: '읍면동',
        address: it.sgg,
        lat: it.center[1],
        lng: it.center[0],
        source: 'emd',
      })),
    [emd.data],
  );
}

/** 넣을 수 없는 까닭(카드 안내) */
const BLOCK_TEXT = {
  full: `장소는 ${MAX_STOPS}곳까지 넣을 수 있어요.`,
  repeat: '이미 바로 앞에 넣은 장소예요',
} as const;

interface Draft {
  name: string;
  stops: Stop[];
}

/** 장소 줄: 출발·경유·도착 이름표, 누르면 지도를 옮기고, 순서 바꾸기(위·아래)와 빼기 */
function EditableStops({
  stops,
  onChange,
  onShow,
}: {
  stops: Stop[];
  onChange(stops: Stop[]): void;
  onShow(stop: Stop): void;
}) {
  if (stops.length === 0) {
    return (
      <p className={styles.empty}>
        아직 장소가 없어요. 위에서 장소를 찾거나 지도를 눌러 더해 보세요.
      </p>
    );
  }
  return (
    <ol className={styles.stops} aria-label="고른 장소">
      {stops.map((s, i) => (
        <li key={s.id} className={styles.stop} data-testid="draft-stop">
          <span className={styles.num} aria-hidden="true">
            {i + 1}
          </span>
          <button type="button" className={styles.stopBody} onClick={() => onShow(s)}>
            <span className={styles.stopRole}>{stopRole(i, stops.length)}</span>
            <span className={styles.stopName} data-testid="draft-stop-name">
              {s.name}
            </span>
          </button>
          <div className={styles.stopActions}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`${i + 1}번 ${s.name} 위로`}
              disabled={i === 0}
              onClick={() => onChange(moveStop(stops, i, -1))}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 10l5-5 5 5" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`${i + 1}번 ${s.name} 아래로`}
              disabled={i === stops.length - 1}
              onClick={() => onChange(moveStop(stops, i, 1))}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 6l5 5 5-5" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`${i + 1}번 ${s.name} 빼기`}
              onClick={() => onChange(removeStop(stops, s.id))}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** 지도를 어디에 맞출지. 처음 화면, 검색 결과 전체, 장소 한 곳. key가 바뀔 때마다 한 번 옮긴다 */
type AimTo = { to: 'start' } | { to: 'results' } | { to: 'point'; point: [number, number] };
type Aim = AimTo & { key: number };

/**
 * 내 코스 만들기·고치기. 위에서 장소를 찾고(읍면동 + 카카오), 지도를 눌러 고른다. 고른 장소는 카드나 결과 줄의
 * 추가 버튼으로만 코스에 들어간다. 장소를 바꿀 때마다 길을 다시 이어 지도에 구간 등급 색으로 미리 보여 준다
 */
function Editor({ source, initial }: { source: DataSource; initial: Draft & { id?: string } }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState<Draft>({ name: initial.name, stops: initial.stops });
  const [search, setSearch] = useState<SearchState>(IDLE);
  // 한 이벤트 안에서 잇달아 오는 조작(지우기 버튼 → 입력칸 포커스)이 앞 조작의 결과 위에 쌓이게 한다
  const searchRef = useRef<SearchState>(IDLE);
  const [aim, setAim] = useState<Aim>({ key: 0, to: 'start' });
  const [reveal, setReveal] = useState<MapReveal | null>(null);
  const local = useLocalCandidates();
  const kakaoOn = useKakaoOn();
  const suggest = useSuggestions(local, search.query, search.mode === 'suggest');
  const results = useResults(
    local,
    search.mode === 'results' ? search.query : null,
    search.mode === 'results' ? search.page : 1,
  );
  const emd = useQuery({ queryKey: EMD_QUERY_KEY, queryFn: fetchEmd });
  const { data: scores } = useScores(source);
  const preview = useDraftPreview(source, draft.stops);
  const [right, measureSheet] = useRightInset();
  const nameId = useId();
  const full = draft.stops.length >= MAX_STOPS;
  const title = initial.id ? '내 코스 고치기' : '새 코스 만들기';
  usePageTitle(title);

  const aimAt = (to: AimTo) => setAim((a) => ({ ...to, key: a.key + 1 }));
  const showPoint = (point: [number, number]) =>
    setReveal((r) => ({ key: (r?.key ?? 0) + 1, point }));

  const act = (a: SearchAction) => {
    const prev = searchRef.current;
    const next = searchReducer(prev, a);
    searchRef.current = next;
    setSearch(next);
    if (
      next.mode === 'results' &&
      (prev.mode !== 'results' || prev.query !== next.query || prev.page !== next.page)
    ) {
      aimAt({ to: 'results' });
    }
    // 추천에서 고른 장소로 옮긴다(지도를 누른 곳은 이미 보고 있으니 옮기지 않는다)
    if (next.mode === 'place' && prev.mode === 'suggest') {
      aimAt({ to: 'point', point: [next.place.lng, next.place.lat] });
    }
  };

  const setStops = (stops: Stop[]) => setDraft((d) => ({ ...d, stops }));
  const isAdded = (c: Candidate) => draft.stops.some((s) => samePlace(s, c));
  const add = (c: Candidate) => {
    if (addBlock(draft.stops, c)) return;
    const stop: Stop = { id: newId(), name: c.name, lat: c.lat, lng: c.lng, source: c.source };
    setDraft((d) => ({ ...d, stops: addStop(d.stops, stop) }));
    act({ type: 'close' });
    showPoint([c.lng, c.lat]);
  };
  const onMapTap = (_h3: string | null, lngLat: [number, number]) => {
    if (search.mode === 'results') return act({ type: 'tap', place: pinCandidate(lngLat) });
    if (full || !inJeju(lngLat)) return;
    act({ type: 'tap', place: pinCandidate(lngLat) });
  };
  const pinCandidate = (lngLat: [number, number]): Candidate => {
    const place = emd.data ? placeAt(emd.data.items, lngLat) : null;
    return {
      key: `map-${lngLat.join(',')}`,
      name: place ? `${place.item.name}${place.inside ? '' : ' 근처'} 지점` : '지도에서 고른 곳',
      category: '지도에서 고른 곳',
      address: place ? `${place.item.sgg} ${place.item.name}` : '',
      lat: lngLat[1],
      lng: lngLat[0],
      source: 'map',
    };
  };

  // 고치기는 처음에 그 코스 장소가 다 보이게, 새로 만들기는 본섬 전체가 보이게(시트 자리를 잰 뒤) 시작한다
  const [start] = useState(() =>
    initial.stops.length > 0
      ? initial.stops.map((s): [number, number] => [s.lng, s.lat])
      : ISLAND_CORNERS,
  );
  const resultItems = search.mode === 'results' ? results.items : null;
  const focus = useMemo<MapFocus | null>(() => {
    if (right === null) return null;
    if (aim.to === 'start') return courseFocus(0, start, right);
    if (aim.to === 'point') return pointFocus(aim.key, aim.point, right);
    if (!resultItems?.length) return null;
    return courseFocus(
      aim.key,
      resultItems.map((c): [number, number] => [c.lng, c.lat]),
      right,
    );
  }, [aim, start, right, resultItems]);
  const route = useMemo(
    () => (preview.summary ? { ...courseRoute(preview.summary), ends: false } : null),
    [preview.summary],
  );
  const pins = useMemo<MapPin[]>(() => {
    if (search.mode === 'results') {
      return results.items.map((c, i) => ({
        lngLat: [c.lng, c.lat],
        label: LETTERS[i],
        kind: 'result',
        active: i === search.selected,
      }));
    }
    const stops = draft.stops.map((s, i): MapPin => ({
      lngLat: [s.lng, s.lat],
      label: `${i + 1}`,
    }));
    if (search.mode !== 'place') return stops;
    return [...stops, { lngLat: [search.place.lng, search.place.lat], label: '+', kind: 'draft' }];
  }, [draft.stops, search, results.items]);

  const back = initial.id ? COURSE_KINDS.mine.href(initial.id) : LIST;
  const canSave = draft.stops.length >= 2;
  const save = () => {
    if (!canSave) return;
    const saved = saveCourse({
      id: initial.id,
      name: draft.name.trim() || '내 코스',
      stops: draft.stops,
    });
    const to = COURSE_KINDS.mine.href(saved.id);
    // 상세에서 고치러 왔으면 그 상세로 돌아간다(같은 상세가 기록에 두 번 쌓이지 않게)
    if (initial.id && location.key !== 'default') navigate(-1);
    else navigate(to, { replace: true });
  };

  let sheetLabel = '코스 만들기';
  let body: ReactNode;
  if (search.mode === 'results') {
    sheetLabel = '검색 결과';
    body = (
      <SearchResults
        query={search.query}
        results={results}
        page={search.page}
        selected={search.selected}
        kakaoOn={kakaoOn}
        isAdded={isAdded}
        full={full}
        onSelect={(i) => {
          act({ type: 'select', index: i });
          const c = i !== null ? results.items[i] : undefined;
          if (c) aimAt({ to: 'point', point: [c.lng, c.lat] });
        }}
        onAdd={add}
        onPage={(page) => act({ type: 'page', page })}
        onClose={() => act({ type: 'close' })}
      />
    );
  } else if (search.mode === 'place') {
    sheetLabel = '고른 장소';
    const block = addBlock(draft.stops, search.place);
    body = (
      <div
        onKeyDown={(e) => {
          if (e.key === 'Escape') act({ type: 'close' });
        }}
      >
        <PlaceCard
          place={search.place}
          blocked={block ? BLOCK_TEXT[block] : null}
          closeLabel="닫기"
          onAdd={() => add(search.place)}
          onClose={() => act({ type: 'close' })}
        />
      </div>
    );
  } else {
    body = (
      <>
        <label htmlFor={nameId} className={styles.label}>
          코스 이름
        </label>
        <input
          id={nameId}
          className={styles.nameInput}
          type="text"
          value={draft.name}
          maxLength={40}
          placeholder="내 코스"
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <p className={styles.count} data-testid="stop-count">
          <strong>
            장소 {draft.stops.length}/{MAX_STOPS}곳
          </strong>{' '}
          {full
            ? `장소는 ${MAX_STOPS}곳까지 넣을 수 있어요.`
            : '장소를 찾거나 지도를 눌러 더해요. 2곳 이상이면 저장할 수 있어요.'}
        </p>
        <EditableStops
          stops={draft.stops}
          onChange={setStops}
          onShow={(s) => aimAt({ to: 'point', point: [s.lng, s.lat] })}
        />
        {draft.stops.length >= 2 && (
          <p
            className={detail.via}
            data-via={preview.route?.via}
            data-testid="draft-via"
            role="status"
          >
            {preview.finding || !preview.route ? (
              '길을 찾는 중이에요'
            ) : (
              <>
                <strong>{VIA_TEXT[preview.route.via].short}</strong>{' '}
                {VIA_TEXT[preview.route.via].note}
              </>
            )}
          </p>
        )}
        <div className={styles.footer}>
          <button type="button" className={styles.primary} disabled={!canSave} onClick={save}>
            저장
          </button>
          <Link
            to={back}
            replace
            className={detail.secondary}
            onClick={(e) => {
              // 앱 안에서 왔으면 뒤로 가기와 같게(목록·상세가 기록에 두 번 쌓이지 않게)
              if (location.key === 'default') return;
              e.preventDefault();
              navigate(-1);
            }}
          >
            취소
          </Link>
        </div>
      </>
    );
  }

  return (
    <main className={detail.page}>
      <div className={detail.overlay}>
        <div className={styles.top}>
          <PageBar title={title} fallback={back} />
          <div className={styles.search}>
            <StopSearch
              state={search}
              dispatch={act}
              suggestions={suggest.items}
              kakaoOn={kakaoOn}
              disabled={full && search.mode === 'idle'}
            />
          </div>
        </div>
        <section
          ref={measureSheet}
          className={`${detail.sheet} ${styles.sheet}`}
          aria-label={sheetLabel}
          data-mode={search.mode}
          data-testid="course-editor"
        >
          {body}
        </section>
      </div>
      <MapView
        scores={scores}
        route={route}
        pins={pins}
        focus={focus}
        panelRight={right ?? 0}
        reveal={reveal}
        onCellSelect={onMapTap}
        onPinSelect={(i) => {
          act({ type: 'select', index: i });
          const c = results.items[i];
          if (c) showPoint([c.lng, c.lat]);
        }}
      />
    </main>
  );
}

/** /courses/mine/new */
export function MyCourseNewPage({ source = dataSource }: { source?: DataSource }) {
  return <Editor source={source} initial={{ name: '', stops: [] }} />;
}

function Missing() {
  return (
    <main className={detail.page}>
      <div className={detail.overlay}>
        <div className={detail.top}>
          <PageBar title="내 코스" fallback={LIST} />
        </div>
        <div className={detail.sheet} role="alert">
          <p className={detail.reason}>코스를 찾지 못했어요</p>
          <Link to={LIST} className={detail.listLink}>
            코스 목록 보기
          </Link>
        </div>
      </div>
    </main>
  );
}

/** /courses/mine/:id/edit */
export function MyCourseEditPage({ source = dataSource }: { source?: DataSource }) {
  const id = useParams().id ?? '';
  const course = useMyCourses().find((c) => c.id === id);
  if (!course) return <Missing />;
  return <Editor key={course.id} source={source} initial={course} />;
}

/** 내 코스 상세 아래 조작: 고치기, 지우기(한 번 더 묻는다) */
function MineActions({ id }: { id: string }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  return (
    <div className={detail.actions}>
      {asking ? (
        <>
          <p className={detail.confirm} role="alert">
            이 코스를 지울까요? 이 기기에서 지우면 되돌릴 수 없어요.
          </p>
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              deleteCourse(id);
              navigate(LIST, { replace: true });
            }}
          >
            지우기
          </button>
          <button type="button" className={detail.secondary} onClick={() => setAsking(false)}>
            그만두기
          </button>
        </>
      ) : (
        <>
          <Link to={`${COURSE_KINDS.mine.href(id)}/edit`} className={detail.listLink}>
            코스 고치기
          </Link>
          <button type="button" className={detail.secondary} onClick={() => setAsking(true)}>
            코스 지우기
          </button>
        </>
      )}
    </div>
  );
}

/** /courses/mine/:id: 내 코스 결과(올레 상세와 같은 화면 + 고치기·지우기) */
export function MyCourseDetailPage({ source = dataSource }: { source?: DataSource }) {
  const id = useParams().id ?? '';
  const state = useMineDetail(source, id);
  return (
    <CourseDetailScreen
      source={source}
      state={state}
      fallback={LIST}
      actions={<MineActions id={id} />}
    />
  );
}

/**
 * 예시 코스 상세 아래 조작: 내 코스로 가져오기. 복사해 저장한 뒤 그 내 코스 상세를 예시 자리에 두고 고치기 화면을 연다
 * (고치기에서 저장·취소하면 가져온 내 코스 상세로, 거기서 뒤로 가면 목록으로)
 */
function ImportActions({ example }: { example: ExampleCourse }) {
  const navigate = useNavigate();
  return (
    <div className={detail.actions}>
      <button
        type="button"
        className={detail.primary}
        onClick={() => {
          const saved = saveCourse({ name: example.name, stops: exampleStops(example) });
          const href = COURSE_KINDS.mine.href(saved.id);
          navigate(href, { replace: true });
          navigate(`${href}/edit`);
        }}
      >
        내 코스로 가져오기
      </button>
    </div>
  );
}

/** /courses/examples/:id: 예시 코스(내 코스 결과와 같은 화면 + 내 코스로 가져오기) */
export function ExampleCourseDetailPage({ source = dataSource }: { source?: DataSource }) {
  const id = useParams().id ?? '';
  const state = useExampleDetail(source, id);
  const example = findExample(id);
  return (
    <CourseDetailScreen
      key={id}
      source={source}
      state={state}
      fallback={LIST}
      actions={example && <ImportActions example={example} />}
    />
  );
}
