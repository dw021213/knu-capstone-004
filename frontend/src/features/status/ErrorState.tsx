import { InfoIcon } from './InfoIcon';
import styles from './Status.module.css';

/** 위험도 점수를 받지 못했을 때. 다시 시도는 사용자가 누를 때만 한다 */
export function ErrorState({ onRetry }: { onRetry(): void }) {
  return (
    <div className={styles.card} role="alert" data-testid="error-state">
      <InfoIcon className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>위험도를 불러오지 못했어요</p>
        <p className={styles.sub}>인터넷 연결을 확인하고 다시 시도해 주세요.</p>
      </div>
      <button type="button" className={styles.action} onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}
