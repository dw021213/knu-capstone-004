import { InfoIcon } from '../status/InfoIcon';
import type { LocateState } from './useMyLocation';
import styles from './Locate.module.css';

const TEXT: Partial<Record<LocateState['status'], { title: string; sub: string }>> = {
  denied: {
    title: '위치 권한을 켜면 내 주변 위험도를 볼 수 있어요',
    sub: '지금은 제주시청을 기준으로 보여 드려요.',
  },
  unavailable: {
    title: '내 위치를 찾지 못했어요',
    sub: '지금은 제주시청을 기준으로 보여 드려요.',
  },
  outside: {
    title: '제주 밖에 있어요',
    sub: '지도는 그대로 두었어요. 제주 안에서 다시 눌러 보세요.',
  },
};

/** 상단(검색·탭) 바로 아래 띠. 위치를 찾은 경우는 화면 읽기 프로그램에만 알린다 */
export function LocationBanner({ state, onClose }: { state: LocateState; onClose(): void }) {
  if (state.status === 'me') {
    return (
      <p className="sr-only" role="status">
        내 위치로 옮겼어요
      </p>
    );
  }
  const text = TEXT[state.status];
  if (!text) return null;
  return (
    <div className={styles.banner} role="status" data-testid="location-banner">
      <InfoIcon className={styles.bannerIcon} />
      <div className={styles.bannerText}>
        <p className={styles.bannerTitle}>{text.title}</p>
        <p className={styles.bannerSub}>{text.sub}</p>
      </div>
      <button type="button" className={styles.close} aria-label="위치 안내 닫기" onClick={onClose}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
        </svg>
      </button>
    </div>
  );
}
