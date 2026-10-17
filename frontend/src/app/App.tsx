import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SelectedDateProvider } from '../features/date/SelectedDateProvider';
import { CourseDetailPage } from '../pages/CourseDetailPage';
import { CoursesPage } from '../pages/CoursesPage';
import { MapPage } from '../pages/MapPage';
import { SITE_NAME, usePageTitle } from '../shared/page/usePageTitle';
import styles from './App.module.css';

// 스냅숏 데이터는 배포 사이에 바뀌지 않는다
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 1 } },
});

function Home() {
  usePageTitle();
  return (
    <>
      <h1 className="sr-only">{SITE_NAME}</h1>
      <MapPage />
    </>
  );
}

// 라우터는 날짜·점수 캐시 안쪽에 둔다: 화면을 오가도 고른 날짜와 받아 둔 점수가 남는다
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SelectedDateProvider>
        <BrowserRouter>
          <div className={styles.app}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/courses" element={<CoursesPage />} />
              <Route path="/courses/:id" element={<CourseDetailPage />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </div>
        </BrowserRouter>
      </SelectedDateProvider>
    </QueryClientProvider>
  );
}
