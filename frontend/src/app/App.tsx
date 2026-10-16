import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SelectedDateProvider } from '../features/date/SelectedDateProvider';
import { MapPage } from '../pages/MapPage';
import styles from './App.module.css';

// 스냅숏 데이터는 배포 사이에 바뀌지 않는다
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SelectedDateProvider>
        <div className={styles.app}>
          <h1 className="sr-only">제주 안전지도</h1>
          <MapPage />
        </div>
      </SelectedDateProvider>
    </QueryClientProvider>
  );
}
