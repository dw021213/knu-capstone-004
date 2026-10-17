import { useLocation, useNavigate } from 'react-router-dom';
import styles from './PageBar.module.css';

/**
 * 코스 화면 위 막대: 뒤로 버튼 + 화면 제목(h1).
 * 앱 안에서 왔으면 브라우저 뒤로와 같고, 주소로 바로 들어왔으면 fallback(상위 화면)으로 간다
 */
export function PageBar({ title, fallback }: { title: string; fallback: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.back}
        aria-label="뒤로"
        onClick={() => (location.key === 'default' ? navigate(fallback) : navigate(-1))}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3 5 8l5 5" />
        </svg>
      </button>
      <h1 className={styles.title}>{title}</h1>
    </div>
  );
}
