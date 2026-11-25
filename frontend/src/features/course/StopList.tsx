import type { StopView } from './view';
import styles from './StopList.module.css';

/** 코스 장소 목록. 번호는 지도 핀과 같다 */
export function StopList({ stops }: { stops: StopView[] }) {
  return (
    <ol className={styles.list} aria-label="장소 목록" data-testid="stop-list">
      {stops.map((s, i) => (
        <li key={s.key} className={styles.item}>
          <span className={styles.num} aria-hidden="true">
            {i + 1}
          </span>
          <p className={styles.name}>
            <span className="sr-only">{i + 1}번 </span>
            {s.name}
          </p>
        </li>
      ))}
    </ol>
  );
}
