import { useRef, useState } from 'react';
import type { DataSource } from '../../data/types';
import { DatePickerSheet } from './DatePickerSheet';
import { CalendarIcon } from './CalendarIcon';
import { chipLabel, kstNow } from './kst';
import { useSelectedDate } from './useSelectedDate';
import styles from './DateChips.module.css';

/** 지도 아래 '오늘 / 날짜 선택' 칩. 날짜 선택은 달력 시트로 연다 */
export function DateChips({ mode }: { mode: DataSource['mode'] }) {
  const { date, isToday, setDate } = useSelectedDate();
  const [open, setOpen] = useState(false);
  const pickRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    // 닫은 뒤 포커스를 연 칩으로 돌려준다
    requestAnimationFrame(() => pickRef.current?.focus());
  };

  return (
    <div className={styles.bar} data-testid="date-bar">
      {/* 배포본은 날씨를 반영하지 않는다(api 모드는 백엔드 기상 가산이 들어간 값) */}
      {mode === 'snapshot' && (
        <p className={styles.notice}>날씨 미반영 · 공간 점수는 날짜와 무관</p>
      )}
      <div className={styles.chips} role="group" aria-label="날짜">
        <button
          type="button"
          className={styles.chip}
          aria-pressed={isToday}
          onClick={() => setDate(kstNow().date)}
        >
          오늘
        </button>
        <button
          ref={pickRef}
          type="button"
          className={styles.chip}
          aria-pressed={!isToday}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <CalendarIcon className={styles.icon} />
          {isToday ? '날짜 선택' : chipLabel(date)}
        </button>
        {isToday && <span className={styles.today}>{chipLabel(date)}</span>}
      </div>
      {open && (
        <DatePickerSheet
          mode={mode}
          initial={date}
          onClose={close}
          onConfirm={(d) => {
            setDate(d);
            close();
          }}
        />
      )}
    </div>
  );
}
