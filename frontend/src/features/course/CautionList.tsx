import type { CellScore } from '../../data/types';
import { cautionReason, segmentRange } from '../../entities/course/reason';
import type { Segment } from '../../entities/course/segments';
import { LevelBadge } from './LevelBadge';
import styles from './CautionList.module.css';

interface CautionListProps {
  segments: Segment[];
  /** 구간 이름 앞에 붙일 지역 이름(읍면동). 없으면 '구간' */
  placeOf(seg: Segment): string | null;
  cellOf(h3: string): CellScore | undefined;
  selected: number | null;
  onSelect(index: number): void;
}

/** 주의 구간 목록. 지도 빨간 점(canvas)의 키보드 대안이기도 하다 */
export function CautionList({ segments, placeOf, cellOf, selected, onSelect }: CautionListProps) {
  return (
    <ol className={styles.list} aria-label="주의 구간 목록">
      {segments.map((seg, i) => (
        <li key={`${seg.index}`}>
          <button
            type="button"
            className={styles.item}
            aria-pressed={selected === seg.index}
            onClick={() => onSelect(seg.index)}
          >
            <span className={styles.num} aria-hidden="true">
              {i + 1}
            </span>
            <span className={styles.text}>
              <span className={styles.name}>
                <span className="sr-only">{i + 1}번 </span>
                {placeOf(seg) ?? '구간'} {segmentRange(seg)}
              </span>
              <span className={styles.reason}>{cautionReason(cellOf(seg.h3))}</span>
            </span>
            <LevelBadge level={seg.level} size="s" />
          </button>
        </li>
      ))}
    </ol>
  );
}
