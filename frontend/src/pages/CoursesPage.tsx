import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWide } from '../app/useBreakpoint';
import { dataSource, type DataSource } from '../data';
import {
  COURSE_KINDS,
  COURSE_TABS,
  tabFromSearch,
  tabHref,
  type CourseKind,
} from '../entities/course/kinds';
import type { CourseSummary } from '../entities/course/summary';
import { CourseRow } from '../features/course/CourseRow';
import { CourseStatus } from '../features/course/CourseStatus';
import { courseRoute } from '../features/course/route';
import { PageBar } from '../features/course/PageBar';
import type { CourseListState } from '../features/course/view';
import { DayToggle } from '../features/date/DayToggle';
import { MapView, type MapFocus } from '../features/map/MapView';
import { ISLAND_BOUNDS, ISLAND_CENTER } from '../features/map/view';
import { usePageTitle } from '../shared/page/usePageTitle';
import { useMineList, useOlleList } from './courseData';
import { useScores } from './useScores';
import styles from './CoursesPage.module.css';

const TITLE = '오늘 안전한 코스';

/** 오른쪽 패널이 가리는 너비(px)를 잰다. 지도 맞춤을 그 왼쪽 영역에 한다 */
function usePanelInset() {
  const [right, setRight] = useState<number | null>(null);
  const measure = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setRight(Math.max(0, window.innerWidth - el.getBoundingClientRect().left)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [right, measure] as const;
}

/** 데스크톱 목록 왼쪽 지도: 본섬 전체를 패널 왼쪽 영역에 맞추고, 미리 보는 코스 경로를 그린다 */
function CoursesMap({
  source,
  right,
  summary,
}: {
  source: DataSource;
  right: number | null;
  summary: CourseSummary | null;
}) {
  const { data: scores } = useScores(source);
  const focus = useMemo<MapFocus | null>(
    () =>
      right === null
        ? null
        : {
            key: 1,
            bbox: [
              ISLAND_BOUNDS.west,
              ISLAND_BOUNDS.south,
              ISLAND_BOUNDS.east,
              ISLAND_BOUNDS.north,
            ],
            point: ISLAND_CENTER,
            zoom: { min: 9, max: 11 },
            anchorY: 0.5,
            right,
          },
    [right],
  );
  const route = useMemo(() => (summary ? courseRoute(summary) : null), [summary]);
  return (
    <div className={styles.map}>
      <MapView scores={scores} route={route} focus={focus} panelRight={right ?? 0} />
    </div>
  );
}

/** 탭 하나의 목록. 받는 중·실패·준비 중은 공용 안내 */
function TabList({
  kind,
  state,
  onPreview,
}: {
  kind: CourseKind;
  state: CourseListState;
  onPreview(id: string | null): void;
}) {
  const info = COURSE_KINDS[kind];
  if (state.status !== 'ready') return <CourseStatus state={state} />;
  return (
    <>
      {state.items.length > 0 ? (
        <ol className={styles.list} aria-label={info.listLabel}>
          {state.items.map((it) => (
            <CourseRow
              key={it.summary.course.id}
              summary={it.summary}
              href={it.href}
              meta={it.meta}
              onPreview={onPreview}
            />
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>{info.empty}</p>
      )}
      {state.source && (
        <p className={styles.source}>
          {state.source.label}{' '}
          {state.source.href ? (
            <a href={state.source.href} target="_blank" rel="noreferrer">
              {state.source.text}
            </a>
          ) : (
            state.source.text
          )}
        </p>
      )}
    </>
  );
}

/**
 * 코스 목록. 탭(올레 코스 | 내 코스)은 주소(?tab=)에 둔다.
 * 모바일은 전체 화면, 데스크톱은 왼쪽 지도 + 오른쪽 패널
 */
export function CoursesPage({ source = dataSource }: { source?: DataSource }) {
  usePageTitle(TITLE);
  const [search] = useSearchParams();
  const tab = tabFromSearch(search);
  const info = COURSE_KINDS[tab];
  // 보이는 탭의 자료만 받는다(내 코스는 탭을 열 때 경로를 잇는다)
  const lists: Record<CourseKind, CourseListState> = {
    olle: useOlleList(source, tab === 'olle'),
    mine: useMineList(source, tab === 'mine'),
  };
  const state = lists[tab];
  const wide = useWide();
  const [right, measurePanel] = usePanelInset();
  // 지도에 미리 볼 코스: 마우스를 올리거나 포커스한 줄, 없으면 목록 맨 위
  const [hovered, setHovered] = useState<string | null>(null);
  const items = state.status === 'ready' ? state.items : [];
  const preview =
    items.find((it) => it.summary.course.id === hovered)?.summary ?? items[0]?.summary ?? null;
  return (
    <main className={styles.page}>
      {wide && <CoursesMap source={source} right={right} summary={preview} />}
      <div className={styles.bar}>
        <PageBar title={TITLE} fallback="/" />
      </div>
      <div ref={wide ? measurePanel : undefined} className={styles.scroll}>
        <div>
          <nav className={styles.tabs} aria-label="코스 종류">
            {COURSE_TABS.map((k) => (
              <Link
                key={k}
                to={tabHref(k)}
                className={styles.tab}
                aria-current={k === tab ? 'page' : undefined}
              >
                {COURSE_KINDS[k].tab}
              </Link>
            ))}
          </nav>
          <div className={styles.head} data-testid="courses-head">
            <DayToggle mode={source.mode} />
            <p className={styles.help}>{info.help}</p>
            {info.create && (
              <Link to={info.create.href} className={styles.create}>
                {info.create.label}
              </Link>
            )}
          </div>
          <TabList kind={tab} state={state} onPreview={setHovered} />
        </div>
      </div>
    </main>
  );
}
