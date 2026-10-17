import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SelectedDateProvider } from '../features/date/SelectedDateProvider';
import { MapPage } from '../pages/MapPage';
import { usePageTitle } from '../shared/page/usePageTitle';
import styles from './App.module.css';

// 스냅숏 데이터는 배포 사이에 바뀌지 않는다
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 1 } },
});

// 코스 화면은 첫 화면(지도 홈) 번들에서 빼고 들어갈 때 받는다
const CoursesPage = lazy(() =>
  import('../pages/CoursesPage').then((m) => ({ default: m.CoursesPage })),
);
const CourseDetailPage = lazy(() =>
  import('../pages/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage })),
);

function Home() {
  usePageTitle();
  return <MapPage />;
}

// 라우터는 날짜·점수 캐시 안쪽에 둔다: 화면을 오가도 고른 날짜와 받아 둔 점수가 남는다
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SelectedDateProvider>
        <BrowserRouter>
          <div className={styles.app}>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/courses/:id" element={<CourseDetailPage />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </Suspense>
          </div>
        </BrowserRouter>
      </SelectedDateProvider>
    </QueryClientProvider>
  );
}
