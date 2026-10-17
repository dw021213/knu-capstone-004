import { useEffect, useId, useRef } from 'react';
import type { Poi, PoiLayer } from '../../data/types';
import { focusRingSource } from '../../shared/a11y/inputModality';
import { distanceMeters, formatDistance } from '../../shared/geo/distance';
import { LAYER_DEFS, OSM_COORDS } from './layerDefs';
import { ShapeIcon } from './ShapeIcon';
import styles from './PoiCard.module.css';

interface PoiCardProps {
  poi: Poi;
  layer: PoiLayer;
  /** 선택한 셀 중심 [경도, 위도]. 없으면 거리를 보이지 않는다 */
  from: [number, number] | null;
  onClose(): void;
}

/** 마커를 눌렀을 때 지도 아래에 뜨는 시설 카드 */
export function PoiCard({ poi, layer, from, onClose }: PoiCardProps) {
  const def = LAYER_DEFS[poi.type];
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const d = poi.detail ?? {};

  // 다른 마커를 누르면 새 카드로 포커스를 옮겨 읽어 준다
  useEffect(() => {
    ref.current?.focus();
  }, [poi.id]);

  const rows: [string, string][] = [];
  if (poi.type !== 'cctv' && typeof d.kind === 'string') rows.push(['구분', d.kind]);
  if (poi.type === 'cctv') {
    if (d.purpose != null) rows.push(['목적', String(d.purpose)]);
    if (d.cameras != null) rows.push(['카메라', `${d.cameras}대`]);
  }

  return (
    <section
      ref={ref}
      className={styles.card}
      onFocus={focusRingSource.onFocus}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="poi-card"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className={styles.head}>
        <span className={styles.kind}>
          <ShapeIcon shape={def.shape} className={styles.shape} />
          {def.name}
        </span>
        <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </div>
      <h2 id={titleId} className={styles.title}>
        {poi.name}
      </h2>
      {(rows.length > 0 || from) && (
        <dl className={styles.rows}>
          {rows.map(([k, v]) => (
            <div key={k} className={styles.row}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          {from && (
            <div className={styles.row}>
              <dt>거리</dt>
              <dd data-testid="poi-distance">
                선택한 셀 중심에서 {formatDistance(distanceMeters(from, [poi.lng, poi.lat]))}
              </dd>
            </div>
          )}
        </dl>
      )}
      <p className={styles.source}>
        출처 {layer.source}
        {OSM_COORDS.has(poi.type) && ' · 좌표 © OpenStreetMap contributors'}
      </p>
    </section>
  );
}
