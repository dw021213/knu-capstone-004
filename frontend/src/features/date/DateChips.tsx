import { useRef, useState } from 'react';
import type { DataSource } from '../../data/types';
import { DatePickerSheet } from './DatePickerSheet';
import { CalendarIcon } from './CalendarIcon';
import { chipLabel, kstNow } from './kst';
import { useSelectedDate } from './useSelectedDate';
import styles from './DateChips.module.css';

// 배포본은 날씨를 반영하지 않는다. api 모드의 기상 가산은 AWS 관측 기반이라 미래 날짜에는 들어가지 않는다
const NOTICE: Record<DataSource['mode'], string> = {
  snapshot: '날씨 미반영 · 공간 점수는 날짜와 무관',
  api: '날씨는 오늘 관측값만 반영',
};

/** 지도 아래 '오늘 / 날짜 선택' 칩. 날짜 선택은 달력 시트로 연다 */
export function DateChips({
  mode,
  disabled = false,
}: {
  mode: DataSource['mode'];
  /** 점수를 받는 동안: 눌러도 반응하지 않는다 */
  disabled?: boolean;
}) {
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
      <p className={styles.notice}>{NOTICE[mode]}</p>
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
