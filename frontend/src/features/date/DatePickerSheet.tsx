import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DataSource } from '../../data/types';
import { WEEKDAY_NAMES, addDays, chipLabel, kstNow, monthCells, shortLabel } from './kst';
import styles from './DatePickerSheet.module.css';

/** 오늘부터 며칠 뒤까지 날씨 반영 점을 찍는지(api 모드만) */
export const WEATHER_DAYS = 5;

interface Props {
  mode: DataSource['mode'];
  /** 처음 고른 상태로 둘 날짜 */
  initial: string;
  onClose(): void;
  onConfirm(d: string): void;
}

const ym = (d: string) => d.slice(0, 7);

function shiftMonth(y: number, m: number, n: number): [number, number] {
  const i = y * 12 + (m - 1) + n;
  return [Math.floor(i / 12), (i % 12) + 1];
}

/** 하단 시트 달력. 오늘부터 앞으로 고를 수 있고 지난 날짜는 비활성 */
export function DatePickerSheet({ mode, initial, onClose, onConfirm }: Props) {
  const today = kstNow().date;
  const [pending, setPending] = useState(initial);
  const [[year, month], setMonth] = useState<[number, number]>(() => [
    Number(initial.slice(0, 4)),
    Number(initial.slice(5, 7)),
  ]);
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const weatherEnd = addDays(today, WEATHER_DAYS);
  const showDots = mode === 'api';
  const atFirstMonth = `${year}-${String(month).padStart(2, '0')}` <= ym(today);

  // 열리면 고른 날짜(없으면 오늘) 칸으로 포커스
  useEffect(() => {
    sheetRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, []);

  // 시트 안에서만 Tab이 돌게 하고 Escape로 닫는다
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...sheetRef.current!.querySelectorAll<HTMLElement>('button:not([disabled])')];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className={styles.root}>
      <div className={styles.scrim} data-testid="sheet-scrim" onClick={onClose} />
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            날짜 선택
          </h2>
          <button type="button" className={styles.iconButton} aria-label="닫기" onClick={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>
        <div className={styles.monthNav}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="이전 달"
            disabled={atFirstMonth}
            onClick={() => setMonth(shiftMonth(year, month, -1))}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" />
            </svg>
          </button>
          <h3 className={styles.month} aria-live="polite">
            {year}년 {month}월
          </h3>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="다음 달"
            onClick={() => setMonth(shiftMonth(year, month, 1))}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
        </div>
        <div className={styles.grid}>
          {WEEKDAY_NAMES.map((w) => (
            <span key={w} className={styles.weekday} aria-hidden="true">
              {w}
            </span>
          ))}
          {monthCells(year, month).map((d, i) =>
            d === null ? (
              <span key={`blank-${i}`} />
            ) : (
              <button
                key={d}
                type="button"
                className={styles.day}
                aria-label={chipLabel(d)}
                aria-pressed={d === pending}
                aria-current={d === today ? 'date' : undefined}
                disabled={d < today}
                onClick={() => setPending(d)}
              >
                <span className={styles.dayNum}>{Number(d.slice(8))}</span>
                {showDots && d >= today && d <= weatherEnd && (
                  <span className={styles.dot} data-testid="weather-dot" aria-hidden="true" />
                )}
              </button>
            ),
          )}
        </div>
        {showDots && (
          <p className={styles.note}>
            <span className={styles.dot} aria-hidden="true" />점 = 날씨 반영 기간 (오늘 ~{' '}
            {shortLabel(weatherEnd)})
          </p>
        )}
        <button type="button" className={styles.confirm} onClick={() => onConfirm(pending)}>
          {chipLabel(pending)} 보기
        </button>
      </div>
    </div>,
    document.body,
  );
}
