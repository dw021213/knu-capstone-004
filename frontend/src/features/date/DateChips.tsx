import { useRef, useState } from 'react';
import type { DataSource, Scores } from '../../data/types';
import { DatePickerSheet } from './DatePickerSheet';
import { DATE_NOTICE } from './notice';
import { CalendarIcon } from './CalendarIcon';
import { chipLabel, kstNow } from './kst';
import { useSelectedDate } from './useSelectedDate';
import styles from './DateChips.module.css';

/** 지도 아래 '오늘 / 날짜 선택' 칩. 날짜 선택은 달력 시트로 연다 */
export function DateChips({
  mode,
  disabled = false,
  weather,
}: {
  mode: DataSource['mode'];
  /** 점수를 받는 동안: 눌러도 반응하지 않는다 */
  disabled?: boolean;
  /** 받은 점수의 기상 반영 상태. api 모드에서 가산이 빠졌으면 범례 아래 안내 하나만 둔다 */
  weather?: Scores['weather'];
}) {
  const notice =
    mode === 'api' && (weather === 'no_data' || weather === 'off') ? null : DATE_NOTICE[mode];
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
      {notice && <p className={styles.notice}>{notice}</p>}
      <div className={styles.chips} role="group" aria-label="날짜">
        <button
          type="button"
          className={styles.chip}
          aria-pressed={isToday}
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) setDate(kstNow().date);
          }}
        >
          오늘
        </button>
        <button
          ref={pickRef}
          type="button"
          className={styles.chip}
          aria-pressed={!isToday}
          aria-haspopup="dialog"
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) setOpen(true);
          }}
        >
          <CalendarIcon className={styles.icon} />
          {isToday ? '날짜 선택' : chipLabel(date)}
        </button>
        {isToday && <span className={styles.today}>{chipLabel(date)}</span>}
      </div>
      {open && (
        <DatePickerSheet
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
