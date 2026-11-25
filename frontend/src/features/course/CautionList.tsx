import { useState } from 'react';
import { CAUTION_PREVIEW, byLength, type CautionGroup } from '../../entities/course/caution';
import { kmRange, placeRange } from '../../entities/course/summary';
import { RiskBand } from './RiskBand';
import styles from './CautionList.module.css';

interface CautionListProps {
  groups: CautionGroup[];
  /** 묶음 처음·끝의 지역 이름(읍면동) */
  placeOf(group: CautionGroup, end: 'start' | 'end'): string | null;
  selected: number | null;
  onSelect(id: number): void;
}

/**
 * 주의할 구간 묶음 목록. 길이가 긴 순으로 몇 곳만 먼저 보이고 나머지는 펼친다.
 * 누르면 지도가 그 구간으로 옮겨 강조한다(canvas 경로의 키보드 대안)
 */
export function CautionList({ groups, placeOf, selected, onSelect }: CautionListProps) {
  const [all, setAll] = useState(false);
  const sorted = byLength(groups);
  const shown = all ? sorted : sorted.slice(0, CAUTION_PREVIEW);
  return (
    <>
      <ol className={styles.list} aria-label="주의할 구간 목록">
        {shown.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              className={styles.item}
              aria-pressed={selected === g.id}
              onClick={() => onSelect(g.id)}
            >
              <span className={styles.name}>
                {placeRange(placeOf(g, 'start'), placeOf(g, 'end'))}
              </span>
              <span className={styles.range}>{kmRange(g.startKm, g.endKm)}</span>
              <span className={styles.band}>
                <RiskBand segments={g.segments} size="s" />
              </span>
            </button>
          </li>
        ))}
      </ol>
      {sorted.length > CAUTION_PREVIEW && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
        >
          {all ? '주의할 구간 접기' : `주의할 구간 모두 보기(${sorted.length}곳)`}
        </button>
      )}
    </>
  );
}
