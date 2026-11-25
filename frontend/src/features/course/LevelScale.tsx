import { LEVEL_NAME, type Level } from '../../entities/risk/level';
import styles from './LevelScale.module.css';

const LEVELS: Level[] = [1, 2, 3, 4, 5];

/** 등급 색 범례 한 줄: 낮음 1~5 높음(지도 범례와 같은 색), 데이터 부족이 있으면 빗금 칸 */
export function LevelScale({ noData }: { noData: boolean }) {
  return (
    <div className={styles.scale} data-testid="level-scale">
      <span className={styles.end} aria-hidden="true">
        낮음
      </span>
      <ul className={styles.ramp} aria-label="구간 등급 색">
        {LEVELS.map((lv) => (
          <li key={lv} className={styles.swatch} data-level={lv}>
            {lv}
            <span className="sr-only">단계 {LEVEL_NAME[lv]}</span>
          </li>
        ))}
      </ul>
      <span className={styles.end} aria-hidden="true">
        높음
      </span>
      {noData && (
        <span className={styles.noData}>
          <span className={styles.hatch} aria-hidden="true" />
          도로 자료 없음
        </span>
      )}
    </div>
  );
}
