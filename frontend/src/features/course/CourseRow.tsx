import { Link } from 'react-router-dom';
import { cautionCount, noDataLine, type CourseSummary } from '../../entities/course/summary';
import { RiskBand } from './RiskBand';
import styles from './CourseRow.module.css';

/**
 * 목록 한 줄: 이름, 구간 색 띠, 길이·주의할 구간 수(+ 데이터 부족이 많으면 한 줄). 누르면 상세.
 * onPreview: 마우스를 올리거나 포커스하면 코스 id, 벗어나면 null(데스크톱 지도 미리 보기)
 */
export function CourseRow({
  summary,
  href,
  meta = [],
  tag = null,
  onPreview,
}: {
  summary: CourseSummary;
  /** 상세 주소(코스 종류마다 다르다) */
  href: string;
  /** 길이 앞에 붙일 짧은 정보 */
  meta?: readonly string[];
  /** 이름 옆 표지(예시 코스) */
  tag?: string | null;
  onPreview?: (id: string | null) => void;
}) {
  const { course, noDataRatio } = summary;
  const noData = noDataLine(noDataRatio);
  return (
    <li className={styles.row}>
      <Link
        to={href}
        className={styles.link}
        onMouseEnter={() => onPreview?.(course.id)}
        onMouseLeave={() => onPreview?.(null)}
        onFocus={() => onPreview?.(course.id)}
        onBlur={() => onPreview?.(null)}
      >
        <div className={styles.body}>
          <h2 className={styles.name}>
            {course.name}
            {tag && <span className={styles.tag}>{tag}</span>}
          </h2>
          {/* 색 띠는 바로 아래 글(주의할 구간 수)과 같은 내용이라 화면 읽기에서 숨긴다 */}
          <div className={styles.band}>
            <RiskBand segments={summary.segments} />
          </div>
          <p className={styles.meta}>
            {[...meta, `${course.lengthKm.toFixed(1)}km`, cautionCount(summary)].join(' · ')}
          </p>
          {noData && <p className={styles.noData}>{noData}</p>}
        </div>
        <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
          <path d="m6 3 5 5-5 5" />
        </svg>
      </Link>
    </li>
  );
}
