import { bandPieces } from '../../entities/course/band';
import type { Segment } from '../../entities/course/segments';
import styles from './RiskBand.module.css';

/**
 * 구간 색 띠: 코스(또는 그 일부)를 따라 구간 등급 색을 거리 비례로 이어 붙인다. 숫자는 붙이지 않는다.
 * label이 없으면 화면 읽기에서 숨긴다(같은 내용을 옆 글이 이미 말할 때)
 */
export function RiskBand({
  segments,
  label = null,
  size = 'm',
}: {
  segments: readonly Segment[];
  label?: string | null;
  size?: 's' | 'm';
}) {
  return (
    <span
      className={styles.band}
      data-size={size}
      data-testid="risk-band"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {bandPieces(segments).map((p, i) => (
        <span
          key={i}
          className={styles.piece}
          data-level={p.level ?? 'none'}
          style={{ width: `${p.share * 100}%` }}
        />
      ))}
    </span>
  );
}
