import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { dataSource, type DataSource } from '../data';
import { groupCoords, type CautionGroup } from '../entities/course/caution';
import { COURSE_KINDS, kindOfId, tabHref } from '../entities/course/kinds';
import { cautionCount } from '../entities/course/summary';
import { EMD_QUERY_KEY, fetchEmd, placeAt } from '../entities/place/emd';
import { MODEL_SOURCE } from '../entities/risk/reason';
import { CautionList } from '../features/course/CautionList';
import { CourseStatus } from '../features/course/CourseStatus';
import { LevelScale } from '../features/course/LevelScale';
import { PageBar } from '../features/course/PageBar';
import { RiskBand } from '../features/course/RiskBand';
import {
  courseFocus,
  courseRoute,
  midOf,
  routeCells,
  stretchFocus,
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
 * 코스 상세: 지도에 구간별 색 경로(장소가 있으면 번호 핀), 아래(데스크톱은 오른쪽) 시트에
 * 날짜, 등급 색 범례와 구간 색 띠, 주의할 구간 묶음, 장소 목록(내 코스), 출처. 올레·내 코스가 같이 쓴다.
 * 코스 하나에 등급이나 점수를 매기지 않는다(멘토 회의: 색만 보고 더 유의할 곳을 알면 된다)
 */
export function CourseDetailScreen({ source, state, fallback, actions }: ScreenProps) {
  const { data: scores } = useScores(source);
  const emd = useQuery({ queryKey: EMD_QUERY_KEY, queryFn: fetchEmd });
  const view = state.status === 'ready' ? state.view : null;
  const summary = view?.summary ?? null;
  usePageTitle(summary?.course.name ?? '코스');

  // 처음에는 코스 전체(시트 자리를 잰 뒤), 주의할 구간을 누르면 그 구간으로 옮겨 굵게
  const [right, measureSheet] = useRightInset();
  const [picked, setPicked] = useState<{ id: number; focus: MapFocus } | null>(null);
  const route = useMemo(() => {
    if (!summary) return null;
    const g = picked ? summary.groups.find((x) => x.id === picked.id) : undefined;
    return { ...courseRoute(summary), highlight: g?.segments ?? null, ends: !view?.stops };
  }, [summary, view, picked]);
  const dim = useMemo(() => (summary ? routeCells(summary) : null), [summary]);
  const pins = useMemo(() => stopPins(view), [view]);
  const focus = useMemo(
    () =>
      picked?.focus ??
      (summary && right !== null
        ? courseFocus(0, [...summary.course.coords, ...(pins?.map((p) => p.lngLat) ?? [])], right)
        : null),
    [picked, summary, right, pins],
  );

  const placeOf = (g: CautionGroup, end: 'start' | 'end') => {
    const seg = end === 'start' ? g.segments[0] : g.segments[g.segments.length - 1];
    const p = emd.data ? placeAt(emd.data.items, midOf(seg.coords)) : null;
    return p ? `${p.item.name}${p.inside ? '' : ' 근처'}` : null;
  };

  const title = summary?.course.name ?? '코스';
  const notice = view ? COURSE_KINDS[view.kind].notice : null;
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
            {notice && (
              <div className={styles.notice} data-testid="course-notice">
                {view.subtitle && <p className={styles.subtitle}>{view.subtitle}</p>}
                <p>{notice}</p>
                {view.note && <p className={styles.note}>{view.note}</p>}
              </div>
            )}
            <p className={styles.lead}>
              빨간 구간은 조금 더 유의해서 지나 주세요. 가지 말라는 뜻은 아니에요.
            </p>
            <LevelScale noData={summary.noDataRatio > 0} />
            <div className={styles.bandRow}>
              <RiskBand
                segments={summary.segments}
                label={`구간 위험 색 띠, ${cautionCount(summary)}`}
              />
              <span className={styles.length}>전체 {summary.course.lengthKm.toFixed(1)}km</span>
            </div>
            {summary.noDataRatio > 0 && (
              <p className={styles.basis} data-testid="no-data-note">
                빗금은 도로 자료가 확인되지 않은 구간이에요. 위험하지 않다는 뜻은 아니에요.
              </p>
            )}
            {view.via && (
              <p className={styles.via} data-via={view.via} data-testid="route-via">
                <strong>{VIA_TEXT[view.via].short}</strong> {VIA_TEXT[view.via].note}
              </p>
            )}
            <h2 className={styles.subTitle}>
              {summary.groups.length > 0 ? cautionCount(summary) : '주의할 구간'}
            </h2>
            {summary.groups.length > 0 ? (
              <CautionList
                groups={summary.groups}
                placeOf={placeOf}
                selected={picked?.id ?? null}
                onSelect={(id) => {
                  const g = summary.groups.find((x) => x.id === id)!;
                  setPicked((p) => ({
                    id,
                    focus: stretchFocus((p?.focus.key ?? 0) + 1, groupCoords(g), right ?? 0),
                  }));
                }}
              />
            ) : (
              <p className={styles.basis}>주의할 구간이 없어요.</p>
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
  // 뒤로·앞으로 가기로 다른 코스가 되면 고른 주의할 구간과 지도 맞춤을 처음부터 다시 한다
  return (
    <CourseDetailScreen
      key={id}
      source={source}
      state={state}
      fallback={tabHref(COURSE_KINDS[kind ?? 'olle'].tab)}
    />
  );
}
