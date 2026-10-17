import { LEVEL_NAME, type Level } from '../../entities/risk/level';
import styles from './LevelBadge.module.css';

/** 등급 배지: 색 칸 + 숫자·이름. 데이터 부족은 회색 빗금 칸(안전처럼 보이는 색을 쓰지 않는다) */
export function LevelBadge({ level, size = 'm' }: { level: Level | null; size?: 's' | 'm' }) {
  return (
    <span
      className={styles.badge}
      data-level={level ?? 'none'}
      data-size={size}
      data-testid="level-badge"
    >
      {level === null ? '데이터 부족' : `${level} · ${LEVEL_NAME[level]}`}
    </span>
  );
}
