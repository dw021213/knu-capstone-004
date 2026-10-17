import { useCallback, useMemo, useState } from 'react';
import { useWide } from '../app/useBreakpoint';
import { dataSource, type DataSource } from '../data';
import { sortCourses } from '../entities/course/summary';
import { CourseRow } from '../features/course/CourseRow';
import { CourseStatus } from '../features/course/CourseStatus';
import { courseRoute } from '../features/course/route';
import { PageBar } from '../features/course/PageBar';
import { chipLabel } from '../features/date/kst';
import { DATE_NOTICE } from '../features/date/notice';
import { useSelectedDate } from '../features/date/useSelectedDate';
import { MapView, type MapFocus } from '../features/map/MapView';
import { ISLAND_BOUNDS, ISLAND_CENTER } from '../features/map/view';
import { usePageTitle } from '../shared/page/usePageTitle';
import { useCourseSummaries } from './useCourseSummaries';
import { useScores } from './useScores';
import styles from './CoursesPage.module.css';

const TITLE = '오늘 안전한 코스';
export const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

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
  previewId,
}: {
  source: DataSource;
  right: number | null;
  previewId: string | null;
}) {
  const { data: scores } = useScores(source);
  const state = useCourseSummaries(source);
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
  const summary =
    state.status === 'ready'
      ? (state.summaries.find((s) => s.course.id === previewId) ?? null)
      : null;
  const route = useMemo(() => (summary ? courseRoute(summary) : null), [summary]);
  return (
    <div className={styles.map}>
      <MapView scores={scores} route={route} focus={focus} panelRight={right ?? 0} />
    </div>
  );
}

/** 코스 목록. 위험 등급이 낮은 코스부터. 모바일은 전체 화면, 데스크톱은 왼쪽 지도 + 오른쪽 패널 */
export function CoursesPage({ source = dataSource }: { source?: DataSource }) {
  usePageTitle(TITLE);
  const { date } = useSelectedDate();
  const state = useCourseSummaries(source);
  const wide = useWide();
  const [right, measurePanel] = usePanelInset();
  // 지도에 미리 볼 코스: 마우스를 올리거나 포커스한 줄, 없으면 목록 맨 위
  const [hovered, setHovered] = useState<string | null>(null);
  const sorted = state.status === 'ready' ? sortCourses(state.summaries) : [];
  const previewId = hovered ?? sorted[0]?.course.id ?? null;
  return (
    <main className={styles.page}>
      {wide && <CoursesMap source={source} right={right} previewId={previewId} />}
      <div className={styles.bar}>
        <PageBar title={TITLE} fallback="/" />
      </div>
      <div ref={wide ? measurePanel : undefined} className={styles.scroll}>
        <div>
          <div className={styles.head} data-testid="courses-head">
            <p className={styles.date}>{chipLabel(date)} 기준</p>
            <p className={styles.notice}>{DATE_NOTICE[source.mode]}</p>
            <p className={styles.help}>
              위험 등급이 낮은 코스부터 보여 줘요. 코스 등급은 가장 위험한 구간의 등급이에요.
            </p>
          </div>
          {state.status === 'ready' ? (
            <>
              <ol className={styles.list} aria-label="코스 목록">
                {sorted.map((s) => (
                  <CourseRow key={s.course.id} summary={s} onPreview={setHovered} />
                ))}
              </ol>
              <p className={styles.source}>
                경로{' '}
                <a href={OSM_COPYRIGHT} target="_blank" rel="noreferrer">
                  {state.source}
                </a>
              </p>
            </>
          ) : (
            <CourseStatus state={state} />
          )}
        </div>
      </div>
    </main>
  );
}
