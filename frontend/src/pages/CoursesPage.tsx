import { dataSource, type DataSource } from '../data';
import { sortCourses } from '../entities/course/summary';
import { CourseRow } from '../features/course/CourseRow';
import { CourseStatus } from '../features/course/CourseStatus';
import { PageBar } from '../features/course/PageBar';
import { chipLabel } from '../features/date/kst';
import { DATE_NOTICE } from '../features/date/notice';
import { useSelectedDate } from '../features/date/useSelectedDate';
import { usePageTitle } from '../shared/page/usePageTitle';
import { useCourseSummaries } from './useCourseSummaries';
import styles from './CoursesPage.module.css';

const TITLE = '오늘 안전한 코스';
export const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

/** 코스 목록(모바일 전체 화면). 위험 등급이 낮은 코스부터 */
export function CoursesPage({ source = dataSource }: { source?: DataSource }) {
  usePageTitle(TITLE);
  const { date } = useSelectedDate();
  const state = useCourseSummaries(source);
  return (
    <main className={styles.page}>
      <PageBar title={TITLE} fallback="/" />
      <div className={styles.scroll}>
        <div className={styles.head} data-testid="courses-head">
          <p className={styles.date}>{chipLabel(date)} 기준</p>
          <p className={styles.notice}>{DATE_NOTICE[source.mode]}</p>
          <p className={styles.help}>
            위험 등급이 낮은 코스부터 보여 줘요. 코스 등급은 가장 위험한 구간의 등급이에요.
          </p>
        </div>
        {state.status === 'ready' ? (
          <>
            <ol className={styles.list} aria-label="코스 목록">
              {sortCourses(state.summaries).map((s) => (
                <CourseRow key={s.course.id} summary={s} />
              ))}
            </ol>
            <p className={styles.source}>
              경로{' '}
              <a href={OSM_COPYRIGHT} target="_blank" rel="noreferrer">
                {state.source}
              </a>
            </p>
          </>
        ) : (
          <CourseStatus state={state} />
        )}
      </div>
    </main>
  );
}
