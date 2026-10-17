import { useId, useState } from 'react';
import { LEVEL_NAME, type Level } from '../../entities/risk/level';
import type { DataSource } from '../../data/types';
import { dotDate, kstNow } from '../date/kst';
import styles from './Legend.module.css';

const LEVELS_UP: Level[] = [1, 2, 3, 4, 5];
const LEVELS_DOWN: Level[] = [5, 4, 3, 2, 1];

/** 데스크톱 배치 기준(이 너비 이상이면 처음부터 펼침) */
export const DESKTOP_QUERY = '(min-width: 768px)';

// snapshot 값은 기상 미반영 공간 점수, api 값은 백엔드 기상 가산이 들어간 값(docs/DATA_SOURCES.md)
const BASIS: Record<DataSource['mode'], string> = {
  snapshot: '교통사고 도로 모델 · 날짜와 무관한 공간 점수',
  api: '교통사고 도로 모델 · 기상 가산 반영',
};

function isDesktop(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches;
}

/** 점수 파일 생성 시각 → '점수 기준 2026.10.12 생성'(서울 날짜). 읽을 수 없으면 null */
function basisTime(generatedAt: string | undefined): string | null {
  if (!generatedAt) return null;
  const t = new Date(generatedAt);
  if (Number.isNaN(t.getTime())) return null;
  return `점수 기준 ${dotDate(kstNow(t).date)} 생성`;
}

interface LegendProps {
  mode: DataSource['mode'];
  /** snapshot 점수 파일의 생성 시각(ISO). api 모드는 at 시각 기준이라 적지 않는다 */
  generatedAt?: string;
}

export function Legend({ mode, generatedAt }: LegendProps) {
  const [open, setOpen] = useState(isDesktop);
  const time = mode === 'snapshot' ? basisTime(generatedAt) : null;
  const listId = useId();

  return (
    <section className={styles.legend} data-testid="legend" aria-label="위험도 범례">
      <button
        type="button"
        className={styles.head}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.ramp}>
          {LEVELS_UP.map((lv) => (
            <span key={lv} className={styles.swatch} data-level={lv}>
              {lv}
            </span>
          ))}
        </span>
        {/* 보이는 숫자가 이름 앞에 오게 aria-label 대신 숨김 글자로 이름을 붙인다 */}
        <span className="sr-only"> 위험도 범례</span>
        <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 6 8 10.5 12.5 6" />
        </svg>
      </button>
      <div id={listId} className={styles.body} hidden={!open}>
        <ul className={styles.rows}>
          {LEVELS_DOWN.map((lv) => (
            <li key={lv} className={styles.row} data-testid="legend-level">
              <span className={styles.swatch} data-level={lv}>
                {lv}
              </span>
              <span>{LEVEL_NAME[lv]}</span>
            </li>
          ))}
        </ul>
        <p className={styles.row}>
          <span
            className={`${styles.swatch} ${styles.hatch}`}
            data-testid="legend-no-data-swatch"
            aria-hidden="true"
          />
          <span>데이터 부족(도로 자료 미확인)</span>
        </p>
        <p className={styles.basis}>{BASIS[mode]}</p>
        {time && <p className={styles.time}>{time}</p>}
      </div>
    </section>
  );
}
