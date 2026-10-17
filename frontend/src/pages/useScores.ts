import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DataSource } from '../data/types';
import { useSelectedDate } from '../features/date/useSelectedDate';

/**
 * 지도에 칠할 점수. api 모드는 고른 날짜(+지금 시)를 at으로 실어 날짜가 바뀌면 다시 받고,
 * snapshot 모드는 날짜와 무관한 공간 점수라 한 번만 받는다.
 */
export function useScores(source: DataSource) {
  const { atParam } = useSelectedDate();
  const at = source.mode === 'api' ? atParam() : null;
  return useQuery({
    queryKey: ['scores', source.mode, at],
    queryFn: () => source.getScores(at ? { at } : undefined),
    // 다시 받는 동안 앞 점수를 그대로 그린다
    placeholderData: keepPreviousData,
  });
}
