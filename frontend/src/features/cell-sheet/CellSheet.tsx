import { useEffect, useId, useRef } from 'react';
import type { CellScore, DataSource, PoiType, Scores } from '../../data/types';
import { placeAt, placeLabel } from '../../entities/place/emd';
import { countNearby, nearest } from '../../entities/poi/nearby';
import { buildReason } from '../../entities/risk/reason';
import { formatDistance } from '../../shared/geo/distance';
import { cellCenter } from '../../shared/geo/h3';
import { LAYER_DEFS, OSM_COORDS } from '../layers/layerDefs';
import { LAYER_TYPES } from '../layers/useLayers';
import type { SheetData } from './useSheetData';
import styles from './CellSheet.module.css';

export type SheetTarget = { kind: 'cell'; h3: string } | { kind: 'sea'; lngLat: [number, number] };

interface CellSheetProps {
  target: SheetTarget;
  /** target이 셀이면 그 셀 점수 */
  cell?: CellScore;
  mode: DataSource['mode'];
  weather: Scores['weather'];
  /** 고른 날짜(예: '10월 17일 (토)'). api 모드 기준 문구에 쓴다 */
  dateLabel: string;
  data: SheetData;
  /** 시설 카드가 떠 있는 동안 숨긴다(선택은 그대로) */
  hidden?: boolean;
  onClose(): void;
}

const EMD_SOURCE = '읍면동 경계: 통계청 SGIS, vuski/admdongkor(CC BY 4.0)';
const ER_SOURCE = '응급실: 제주특별자치도, 2025년 12월 기준';
const OSM_SOURCE = '좌표 © OpenStreetMap contributors';

function basisText(mode: DataSource['mode'], weather: Scores['weather'], dateLabel: string) {
  if (mode === 'snapshot') return '교통사고 도로 모델 · 날짜 무관 · 날씨 미반영';
  const w =
    weather === 'on' ? '관측 날씨 반영' : weather === 'no_data' ? '날씨 관측 없음' : '날씨 미반영';
  return `교통사고 도로 모델 · ${dateLabel} · ${w}`;
}

const targetKey = (t: SheetTarget) => (t.kind === 'cell' ? t.h3 : t.lngLat.join(','));

/** 셀(또는 바다)을 눌렀을 때 여는 시트. 모바일은 날짜 칩 위 카드, 데스크톱은 오른쪽 패널 */
export function CellSheet({
  target,
  cell,
  mode,
  weather,
  dateLabel,
  data,
  hidden = false,
  onClose,
}: CellSheetProps) {
  const titleId = useId();
  const helpId = useId();
  const ref = useRef<HTMLElement>(null);
  const key = targetKey(target);

  // 새 셀을 열면 시트로 포커스를 옮겨 읽어 준다
  useEffect(() => {
    if (!hidden) ref.current?.focus({ preventScroll: true });
  }, [key, hidden]);

  const from = target.kind === 'cell' ? cellCenter(target.h3) : target.lngLat;
  const place = data.emd ? placeAt(data.emd.items, from) : null;
  const { facilities, emergency } = data;

  const ready = LAYER_TYPES.filter((t) => facilities[t].status === 'ready');
  const layers = LAYER_TYPES.flatMap((t) => {
    const s = facilities[t];
    return s.status === 'ready' ? [s.layer] : [];
  });
  const counts = countNearby(from, layers);
  const nearby: Partial<Record<PoiType, { r300: number }>> = {};
  for (const t of ready) {
    const c = counts[t];
    if (c !== 'pending') nearby[t] = { r300: c.r300 };
  }

  const erReady = emergency.status === 'done' && emergency.list.status === 'ready';
  const fireState = facilities.fire;
  const usedOsm = ready.some((t) => OSM_COORDS.has(t)) || erReady;
  const poiSources = [
    ...ready.map((t) => `${LAYER_DEFS[t].name}: ${LAYER_DEFS[t].source}`),
    ...(erReady ? [ER_SOURCE] : []),
    ...(usedOsm ? [OSM_SOURCE] : []),
    ...(data.emd ? [EMD_SOURCE] : []),
  ];

  const reason =
    target.kind === 'cell' && cell
      ? buildReason({
          level: cell.level,
          percentile: cell.percentile,
          roadSource: cell.roadSource,
          nearby,
          weather: mode === 'api' ? weather : 'off',
          poiSources,
        })
      : null;
  // 바다: 위험도·주변 시설이 없으므로 가까운 도움에 쓴 자료의 출처만
  const fireReady = fireState.status === 'ready';
  const seaSources = [
    ...(fireReady ? [`${LAYER_DEFS.fire.name}: ${LAYER_DEFS.fire.source}`] : []),
    ...(erReady ? [ER_SOURCE] : []),
    ...(fireReady || erReady ? [OSM_SOURCE] : []),
    ...(data.emd ? [EMD_SOURCE] : []),
  ];
  const sources = reason ? reason.sources : seaSources;

  const fireNear = fireState.status === 'ready' ? nearest(from, fireState.layer) : null;
  const erNear = erReady ? nearest(from, emergency.list) : null;

  const title =
    target.kind === 'sea'
      ? '이 위치는 위험도 정보가 없어요'
      : place
        ? placeLabel(place)
        : '선택한 셀';

  const heading = (
    <h2 id={titleId} className={styles.title}>
      {title}
    </h2>
  );
  const chips = sources.length > 0 && (
    <ul className={styles.chips} aria-label="출처">
      {sources.map((s) => (
        <li key={s} className={styles.chip}>
          {s}
        </li>
      ))}
    </ul>
  );

  return (
    <section
      ref={ref}
      className={styles.sheet}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      hidden={hidden}
      data-testid="cell-sheet"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={styles.head}>
        {reason && cell ? (
          <p className={styles.badgeRow}>
            <span
              className={styles.badge}
              data-level={cell.level ?? 'none'}
              data-testid="sheet-badge"
            >
              {reason.headline}
            </span>
            {cell.level === null && <span className={styles.badgeNote}>도로 자료 미확인</span>}
          </p>
        ) : (
          heading
        )}
        <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </div>

      {target.kind === 'cell' && heading}
      {data.emdError && (
        <p className={styles.basis} data-testid="sheet-place-error">
          지역 이름을 불러오지 못했어요
        </p>
      )}
      {target.kind === 'sea' && place && (
        <p className={styles.basis}>가까운 지역: {placeLabel({ ...place, inside: true })}</p>
      )}

      {reason && (
        <>
          <p className={styles.basis} data-testid="sheet-basis">
            {basisText(mode, weather, dateLabel)}
          </p>
          <p className={styles.reason} data-testid="sheet-reason">
            {reason.body}
          </p>
        </>
      )}

      {target.kind === 'cell' && chips}

      {target.kind === 'cell' && (
        <table className={styles.table}>
          <caption className={styles.caption}>주변 시설(직선거리, 곳)</caption>
          <thead>
            <tr>
              <th scope="col">시설</th>
              <th scope="col">300m 안</th>
              <th scope="col">500m 안</th>
            </tr>
          </thead>
          <tbody>
            {LAYER_TYPES.map((t) => {
              const st = facilities[t].status;
              const c = counts[t];
              const cellText = (n: 'r300' | 'r500') =>
                st === 'ready' && c !== 'pending'
                  ? String(c[n])
                  : st === 'pending'
                    ? '준비 중'
                    : '…';
              return (
                <tr key={t}>
                  <th scope="row">{LAYER_DEFS[t].name}</th>
                  {/* 받지 못한 종류는 두 칸을 합쳐 한 번만 알린다(나머지 줄은 그대로) */}
                  {st === 'error' ? (
                    <td colSpan={2}>불러오지 못했어요</td>
                  ) : (
                    <>
                      <td>{cellText('r300')}</td>
                      <td>{cellText('r500')}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <section className={styles.help} aria-labelledby={helpId}>
        <h3 id={helpId} className={styles.helpTitle}>
          가까운 도움
        </h3>
        <dl className={styles.helpRows}>
          <div className={styles.helpRow} data-testid="help-fire">
            <dt>119안전센터</dt>
            <dd>
              {fireNear
                ? `${fireNear.poi.name} ${formatDistance(fireNear.meters)}`
                : fireState.status === 'pending'
                  ? '자료 준비 중'
                  : fireState.status === 'error'
                    ? '불러오지 못했어요'
                    : '…'}
            </dd>
          </div>
          {/* 응급실 자료가 없으면 119만 보인다 */}
          {!(emergency.status === 'done' && emergency.list.status === 'pending') && (
            <div className={styles.helpRow} data-testid="help-er">
              <dt>응급실</dt>
              <dd>
                {erNear
                  ? `${erNear.poi.name} ${formatDistance(erNear.meters)}`
                  : emergency.status === 'error'
                    ? '불러오지 못했어요'
                    : '…'}
              </dd>
            </div>
          )}
        </dl>
        <p className={styles.helpNote}>
          {target.kind === 'cell' ? '셀 중심에서' : '누른 곳에서'} 직선거리
        </p>
      </section>
      {target.kind === 'sea' && chips}
    </section>
  );
}
