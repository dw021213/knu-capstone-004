import { usePageTitle } from '../shared/page/usePageTitle';

const TITLE = '오늘 안전한 코스';

/** 코스 목록(모바일 전체 화면) */
export function CoursesPage() {
  usePageTitle(TITLE);
  return (
    <main>
      <h1>{TITLE}</h1>
    </main>
  );
}
