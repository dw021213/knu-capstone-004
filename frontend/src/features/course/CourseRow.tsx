import { Link } from 'react-router-dom';
import { noDataLine } from '../../entities/course/reason';
import { courseLine, type CourseSummary } from '../../entities/course/summary';
import { LevelBadge } from './LevelBadge';
import styles from './CourseRow.module.css';

/**
 * 목록 한 줄: 등급 배지, 이름, 길이, 한 줄 이유(+ 데이터 부족이 많으면 한 줄). 누르면 상세.
 * onPreview: 마우스를 올리거나 포커스하면 코스 id, 벗어나면 null(데스크톱 지도 미리 보기)
 */
export function CourseRow({
  summary,
  href,
  meta = [],
  onPreview,
}: {
  summary: CourseSummary;
  /** 상세 주소(코스 종류마다 다르다) */
  href: string;
  /** 길이 앞에 붙일 짧은 정보 */
  meta?: readonly string[];
  onPreview?: (id: string | null) => void;
}) {
  const { course, level, cautionKm, noDataRatio } = summary;
  const noData = noDataLine(noDataRatio);
  return (
    <li className={styles.row} data-level={level ?? 'none'} data-caution-km={cautionKm.toFixed(3)}>
      <Link
        to={href}
        className={styles.link}
        onMouseEnter={() => onPreview?.(course.id)}
        onMouseLeave={() => onPreview?.(null)}
        onFocus={() => onPreview?.(course.id)}
        onBlur={() => onPreview?.(null)}
      >
        <LevelBadge level={level} />
        <div className={styles.body}>
          <h2 className={styles.name}>{course.name}</h2>
          <p className={styles.meta}>{[...meta, `${course.lengthKm.toFixed(1)}km`].join(' · ')}</p>
          <p className={styles.line}>{courseLine(summary)}</p>
          {noData && <p className={styles.noData}>{noData}</p>}
        </div>
        <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
          <path d="m6 3 5 5-5 5" />
        </svg>
      </Link>
    </li>
  );
}
