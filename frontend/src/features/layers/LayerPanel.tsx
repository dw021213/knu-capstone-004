import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { PoiType } from '../../data/types';
import { LAYER_DEFS } from './layerDefs';
import { ShapeIcon } from './ShapeIcon';
import { LAYER_TYPES } from './useLayers';
import type { LayerState } from './usePoiLayers';
import styles from './LayerPanel.module.css';

interface LayerPanelProps {
  on: Set<PoiType>;
  toggle(t: PoiType): void;
  /** 켠 개수(pending은 빼고 센다) */
  count: number;
  states: Record<PoiType, LayerState>;
}

function statusText(s: LayerState): string | null {
  if (s.status === 'pending') return '준비 중';
  if (s.status === 'loading') return '불러오는 중';
  if (s.status === 'error') return '불러오지 못했어요';
  return null;
}

/** 지도 좌상단 '레이어' 버튼과 펼치는 시설 레이어 토글 5개 */
export function LayerPanel({ on, toggle, count, states }: LayerPanelProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const rowId = useId();

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div className={styles.root} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.75 14.5 5 8 8.25 1.5 5Z" />
          <path d="M1.5 8 8 11.25 14.5 8M1.5 11 8 14.25 14.5 11" />
        </svg>
        레이어
        {/* 이름은 보이는 글자 그대로 '레이어 2' + 숨김 글자 '개 켜짐' */}
        {count > 0 && (
          <>
            {' '}
            <span className={styles.badge} data-testid="layer-badge">
              {count}
            </span>
            <span className="sr-only">개 켜짐</span>
          </>
        )}
      </button>
      <section id={panelId} className={styles.panel} aria-label="시설 레이어" hidden={!open}>
        <ul className={styles.rows}>
          {LAYER_TYPES.map((t) => {
            const def = LAYER_DEFS[t];
            const state = states[t];
            const pending = state.status === 'pending';
            const checked = on.has(t) && !pending;
            const status = statusText(state);
            return (
              <li key={t}>
                <button
                  type="button"
                  role="switch"
                  className={styles.row}
                  aria-checked={checked}
                  aria-labelledby={`${rowId}-${t}-name`}
                  aria-describedby={`${rowId}-${t}-desc`}
                  disabled={pending}
                  onClick={() => toggle(t)}
                >
                  <ShapeIcon shape={def.shape} className={styles.shape} />
                  <span className={styles.text}>
                    <span id={`${rowId}-${t}-name`} className={styles.name}>
                      {def.name}
                    </span>
                    <span id={`${rowId}-${t}-desc`} className={styles.desc}>
                      <span>{def.desc}</span>
                      <span>출처 {def.source}</span>
                      {status && <span className={styles.status}>{status}</span>}
                    </span>
                  </span>
                  <span className={styles.track} data-testid="switch-track" aria-hidden="true">
                    <span className={styles.thumb} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
