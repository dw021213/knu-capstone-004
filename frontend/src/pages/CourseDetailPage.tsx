import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { dataSource, type DataSource } from '../data';
import { kindOfId, tabHref } from '../entities/course/kinds';
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
import { StopList } from '../features/course/StopList';
import type { CourseDetailState, CourseView } from '../features/course/view';
import { VIA_TEXT } from '../features/course/via';
import { DayToggle } from '../features/date/DayToggle';
import { MapView, type MapFocus } from '../features/map/MapView';
import { usePageTitle } from '../shared/page/usePageTitle';
import { useCatalogDetail } from './courseData';
import { useRightInset } from './useRightInset';
import { useScores } from './useScores';
import styles from './CourseDetailPage.module.css';

const EMD_SOURCE = '읍면동 경계: 통계청 SGIS, vuski/admdongkor(CC BY 4.0)';

/** 지도에 찍을 장소 핀(번호는 장소 목록과 같다) */
const stopPins = (view: CourseView | null) =>
  view?.stops?.map((s, i) => ({ lngLat: s.lngLat, label: String(i + 1) })) ?? null;

interface ScreenProps {
  source: DataSource;
  state: CourseDetailState;
  /** 뒤로 버튼이 주소로 바로 들어왔을 때 갈 목록 */
  fallback: string;
  /** 시트 맨 아래 조작(내 코스: 고치기·지우기) */
  actions?: ReactNode;
}

/**
 * 코스 상세: 지도에 구간별 색 경로와 주의 지점(장소가 있으면 번호 핀), 아래(데스크톱은 오른쪽) 시트에
 * 날짜, 등급·설명·주의 구간, 장소 목록(내 코스), 출처. 올레·내 코스가 같이 쓴다
 */
export function CourseDetailScreen({ source, state, fallback, actions }: ScreenProps) {
  const { data: scores } = useScores(source);
  const emd = useQuery({ queryKey: EMD_QUERY_KEY, queryFn: fetchEmd });
  const view = state.status === 'ready' ? state.view : null;
  const summary = view?.summary ?? null;
  usePageTitle(summary?.course.name ?? '코스');

  const route = useMemo(
    () => (summary ? { ...courseRoute(summary), ends: !view?.stops } : null),
    [summary, view],
  );
  const dim = useMemo(() => (summary ? routeCells(summary) : null), [summary]);
  const pins = useMemo(() => stopPins(view), [view]);
  // 처음에는 코스 전체(시트 자리를 잰 뒤), 주의 구간을 누르면 그 구간으로
  const [right, measureSheet] = useRightInset();
  const [picked, setPicked] = useState<{ index: number; focus: MapFocus } | null>(null);
  const focus = useMemo(
    () =>
      picked?.focus ??
      (summary && right !== null
        ? courseFocus(0, [...summary.course.coords, ...(pins?.map((p) => p.lngLat) ?? [])], right)
        : null),
    [picked, summary, right, pins],
  );

  const placeOf = (seg: Segment) => {
    const p = emd.data ? placeAt(emd.data.items, segmentMid(seg)) : null;
    return p ? `${p.item.name}${p.inside ? '' : ' 근처'}` : null;
  };

  const title = summary?.course.name ?? '코스';
  return (
    <main className={styles.page} aria-label="코스 지도">
      {/* 뒤로 막대·시트를 지도보다 먼저 두어 첫 Tab이 뒤로 버튼으로 간다(지도는 z-index로 아래에 깐다) */}
      <div className={styles.overlay}>
        <div className={styles.top}>
          <PageBar title={title} fallback={fallback} />
        </div>
        {state.status === 'missing' ? (
          <div className={styles.sheet} role="alert">
            <p className={styles.reason}>코스를 찾지 못했어요</p>
            <Link to={fallback} className={styles.listLink}>
              코스 목록 보기
            </Link>
          </div>
        ) : state.status !== 'ready' || !summary || !view ? (
          <div className={styles.sheet}>
            <CourseStatus state={state.status === 'ready' ? { status: 'loading' } : state} />
          </div>
        ) : (
          <section
            ref={measureSheet}
            className={styles.sheet}
            aria-label="코스 위험도"
            data-testid="course-sheet"
          >
            <div className={styles.dateRow}>
              <DayToggle mode={source.mode} />
            </div>
            <p className={styles.badgeRow}>
              <LevelBadge level={summary.level} />
              <span className={styles.badgeNote}>
                코스 등급 · {summary.course.lengthKm.toFixed(1)}km
              </span>
            </p>
            <p className={styles.basis}>교통사고 도로 모델 기준이에요</p>
            {view.via && (
              <p className={styles.via} data-via={view.via} data-testid="route-via">
                <strong>{VIA_TEXT[view.via].short}</strong> {VIA_TEXT[view.via].note}
              </p>
            )}
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
            {view.stops && (
              <>
                <h2 className={styles.subTitle}>장소 {view.stops.length}곳</h2>
                <StopList stops={view.stops} />
              </>
            )}
            {actions}
            <ul className={styles.chips} aria-label="출처">
              {view.sources.map((s) => (
                <li key={s} className={styles.chip}>
                  {s}
                </li>
              ))}
              <li className={styles.chip}>{MODEL_SOURCE}</li>
              {emd.data && <li className={styles.chip}>{EMD_SOURCE}</li>}
            </ul>
          </section>
        )}
      </div>
      <MapView
        scores={scores}
        route={route}
        dim={dim}
        focus={focus}
        pins={pins}
        panelRight={right ?? 0}
      />
    </main>
  );
}

/** /courses/:id: 올레 코스 상세 */
export function CourseDetailPage({ source = dataSource }: { source?: DataSource }) {
  const id = useParams().id ?? '';
  const kind = kindOfId(id);
  const state = useCatalogDetail(source, id, kind);
  // 뒤로·앞으로 가기로 다른 코스가 되면 고른 주의 구간과 지도 맞춤을 처음부터 다시 한다
  return (
    <CourseDetailScreen key={id} source={source} state={state} fallback={tabHref(kind ?? 'olle')} />
  );
}
