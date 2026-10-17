import type { CourseState } from '../../pages/useCourseSummaries';
import styles from './CourseStatus.module.css';

/** 코스 화면의 받는 중·실패·자료 없음 안내 */
export function CourseStatus({ state }: { state: Exclude<CourseState, { status: 'ready' }> }) {
  if (state.status === 'loading') {
    return (
      <p className={styles.box} role="status">
        코스를 불러오는 중이에요
      </p>
    );
  }
  if (state.status === 'pending') {
    return <p className={styles.box}>코스 자료를 준비 중이에요</p>;
  }
  return (
    <div className={styles.box} role="alert">
      <p className={styles.title}>코스를 불러오지 못했어요</p>
      <p className={styles.sub}>인터넷 연결을 확인하고 다시 시도해 주세요.</p>
      <button type="button" className={styles.action} onClick={state.retry}>
        다시 시도
      </button>
    </div>
  );
}
