import { Link } from 'react-router-dom';
import { noDataLine } from '../../entities/course/reason';
import { courseLine, type CourseSummary } from '../../entities/course/summary';
import { LevelBadge } from './LevelBadge';
import styles from './CourseRow.module.css';

/** 목록 한 줄: 등급 배지, 이름, 길이, 한 줄 이유(+ 데이터 부족이 많으면 한 줄). 누르면 상세 */
export function CourseRow({ summary }: { summary: CourseSummary }) {
  const { course, level, cautionKm, noDataRatio } = summary;
  const noData = noDataLine(noDataRatio);
  return (
    <li className={styles.row} data-level={level ?? 'none'} data-caution-km={cautionKm.toFixed(3)}>
      <Link to={`/courses/${course.id}`} className={styles.link}>
        <LevelBadge level={level} />
        <div className={styles.body}>
          <h2 className={styles.name}>{course.name}</h2>
          <p className={styles.meta}>{course.lengthKm.toFixed(1)}km</p>
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
