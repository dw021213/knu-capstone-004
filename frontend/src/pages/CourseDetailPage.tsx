import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { dataSource, type DataSource } from '../data';
import { courseReason } from '../entities/course/reason';
import type { Segment } from '../entities/course/segments';
import { EMD_QUERY_KEY, fetchEmd, placeAt } from '../entities/place/emd';
import { MODEL_SOURCE } from '../entities/risk/reason';
import { CautionList } from '../features/course/CautionList';
import { CourseStatus } from '../features/course/CourseStatus';
import { LevelBadge } from '../features/course/LevelBadge';
import { PageBar } from '../features/course/PageBar';
import {
  courseFocus,
  courseRoute,
  routeCells,
  segmentFocus,
  segmentMid,
} from '../features/course/route';
import { DATE_NOTICE } from '../features/date/notice';
import { MapView, type MapFocus } from '../features/map/MapView';
import { usePageTitle } from '../shared/page/usePageTitle';
import { useCourseSummaries } from './useCourseSummaries';
import { useScores } from './useScores';
import styles from './CourseDetailPage.module.css';

const EMD_SOURCE = '읍면동 경계: 통계청 SGIS, vuski/admdongkor(CC BY 4.0)';
/** 데스크톱 배치(시트가 오른쪽 패널)인지. CSS 미디어 쿼리와 같은 기준 */
const isWide = () => window.matchMedia?.('(min-width: 768px)').matches ?? false;

/** 데스크톱 오른쪽 패널이 가리는 너비(px). 모바일은 0. 지도 맞춤을 그 왼쪽 영역에 한다 */
function useRightInset() {
  const [right, setRight] = useState<number | null>(null);
  const measureSheet = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const measure = () =>
      setRight(isWide() ? Math.max(0, window.innerWidth - el.getBoundingClientRect().left) : 0);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [right, measureSheet] as const;
}

/** 코스 상세: 지도에 구간별 색 경로와 주의 지점, 아래(데스크톱은 오른쪽) 시트에 등급·설명·주의 구간 */
export function CourseDetailPage({ source = dataSource }: { source?: DataSource }) {
  const { id } = useParams();
  const state = useCourseSummaries(source);
  const { data: scores } = useScores(source);
  const emd = useQuery({ queryKey: EMD_QUERY_KEY, queryFn: fetchEmd });
  const summary =
    state.status === 'ready' ? (state.summaries.find((s) => s.course.id === id) ?? null) : null;
  usePageTitle(summary?.course.name ?? '코스');

  const route = useMemo(() => (summary ? courseRoute(summary) : null), [summary]);
  const dim = useMemo(() => (summary ? routeCells(summary) : null), [summary]);
  // 처음에는 코스 전체(시트 자리를 잰 뒤), 주의 구간을 누르면 그 구간으로
  const [right, measureSheet] = useRightInset();
  const [picked, setPicked] = useState<{ index: number; focus: MapFocus } | null>(null);
  const focus = useMemo(
    () =>
      picked?.focus ??
      (summary && right !== null ? courseFocus(0, summary.course.coords, right) : null),
    [picked, summary, right],
  );

  const placeOf = (seg: Segment) => {
    const p = emd.data ? placeAt(emd.data.items, segmentMid(seg)) : null;
    return p ? `${p.item.name}${p.inside ? '' : ' 근처'}` : null;
  };

  const title = summary?.course.name ?? '코스';
  return (
    <main className={styles.page} aria-label="코스 지도">
      <MapView scores={scores} route={route} dim={dim} focus={focus} />
      <div className={styles.overlay}>
        <div className={styles.top}>
          <PageBar title={title} fallback="/courses" />
        </div>
        {state.status !== 'ready' ? (
          <div className={styles.sheet}>
            <CourseStatus state={state} />
          </div>
        ) : !summary ? (
          <div className={styles.sheet} role="alert">
            <p className={styles.reason}>코스를 찾지 못했어요</p>
            <Link to="/courses" className={styles.listLink}>
              코스 목록 보기
            </Link>
          </div>
        ) : (
          <section
            ref={measureSheet}
            className={styles.sheet}
            aria-label="코스 위험도"
            data-testid="course-sheet"
          >
            <p className={styles.badgeRow}>
              <LevelBadge level={summary.level} />
              <span className={styles.badgeNote}>
                코스 등급 · {summary.course.lengthKm.toFixed(1)}km
              </span>
            </p>
            <p className={styles.basis}>교통사고 도로 모델 · {DATE_NOTICE[source.mode]}</p>
            <p className={styles.reason} data-testid="course-reason">
              {courseReason(summary)}
            </p>
            <h2 className={styles.subTitle}>
              주의 구간{summary.caution.length > 0 ? ` ${summary.caution.length}곳` : ''}
            </h2>
            {summary.caution.length > 0 ? (
              <CautionList
                segments={summary.caution}
                placeOf={placeOf}
                cellOf={(h3) => scores?.cells.get(h3)}
                selected={picked?.index ?? null}
                onSelect={(index) => {
                  const seg = summary.caution.find((s) => s.index === index)!;
                  setPicked((p) => ({
                    index,
                    focus: segmentFocus((p?.focus.key ?? 0) + 1, seg, right ?? 0),
                  }));
                }}
              />
            ) : (
              <p className={styles.basis}>4단계 이상인 구간이 없어요.</p>
            )}
            <ul className={styles.chips} aria-label="출처">
              <li className={styles.chip}>경로: {state.source}</li>
              <li className={styles.chip}>{MODEL_SOURCE}</li>
              {emd.data && <li className={styles.chip}>{EMD_SOURCE}</li>}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
