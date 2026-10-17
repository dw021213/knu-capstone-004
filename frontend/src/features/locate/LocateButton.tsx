import styles from './Locate.module.css';

/** 지도 오른쪽 아래 '내 위치' 버튼(보조 버튼: 흰 바탕 + 검정 테두리) */
export function LocateButton({ busy, onClick }: { busy: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-busy={busy || undefined}
      onClick={() => {
        if (!busy) onClick();
      }}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </svg>
      내 위치
    </button>
  );
}
