import type { DataSource } from '../../data/types';
import { addDays, chipLabel, kstNow } from './kst';
import { courseDateNotice } from './notice';
import { useSelectedDate } from './useSelectedDate';
import styles from './DayToggle.module.css';

/**
 * 코스 화면의 '오늘 / 내일' 고르기와 그 날짜 안내. 지도 홈의 날짜 칩과 같은 날짜를 쓴다.
 * 지도 홈 달력에서 모레 이후를 골랐으면 두 칩 모두 눌리지 않은 채 그 날짜를 보인다
 */
export function DayToggle({ mode }: { mode: DataSource['mode'] }) {
  const { date, setDate } = useSelectedDate();
  const today = kstNow().date;
  const tomorrow = addDays(today, 1);
  return (
    <div className={styles.root} data-testid="day-toggle">
      <div className={styles.row}>
        <p className={styles.date}>{chipLabel(date)} 기준</p>
        <div className={styles.chips} role="group" aria-label="출발 날짜">
          {(
            [
              ['오늘', today],
              ['내일', tomorrow],
            ] as const
          ).map(([label, d]) => (
            <button
              key={label}
              type="button"
              className={styles.chip}
              aria-pressed={date === d}
              onClick={() => setDate(d)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.notice} data-testid="date-notice">
        {courseDateNotice(mode, date, today)}
      </p>
    </div>
  );
}
