import { InfoIcon } from './InfoIcon';
import styles from './Status.module.css';

/** 위험도 점수를 받는 동안. 배경 지도는 먼저 그려진다 */
export function LoadingBanner() {
  return (
    <div className={styles.card} role="status" data-testid="loading-banner">
      <InfoIcon className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>위험도를 불러오는 중이에요</p>
        <p className={styles.sub}>배경지도는 먼저 보이고, 위험도 격자는 곧 채워져요.</p>
      </div>
    </div>
  );
}
