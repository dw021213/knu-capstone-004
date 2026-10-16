import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DataSource } from '../data/types';
import { segmentCourse } from '../entities/course/segments';
import { summarize, type CourseSummary } from '../entities/course/summary';
import { useScores } from './useScores';

export type CourseState =
  | { status: 'loading' }
  | { status: 'error'; retry(): void }
  | { status: 'pending' }
  | { status: 'ready'; source: string; summaries: CourseSummary[] };

/**
 * 코스 경로 × 지도와 같은 점수로 구간·코스 등급을 만든다.
 * 점수는 지도 홈과 같은 캐시를 쓰므로 화면을 오가도 다시 받지 않는다(api 모드는 고른 날짜 기준)
 */
export function useCourseSummaries(source: DataSource): CourseState {
  const courses = useQuery({
    queryKey: ['courses', source.mode],
    queryFn: () => source.getCourses(),
    retry: false,
  });
  const scores = useScores(source);
  const summaries = useMemo(() => {
    const list = courses.data;
    const cells = scores.data?.cells;
    if (!list || !cells) return null;
    return list.items.map((c) =>
      summarize(
        c,
        segmentCourse(c.coords, (h3) => cells.get(h3)?.level ?? null),
      ),
    );
  }, [courses.data, scores.data]);

  const failed = (courses.isError && !courses.isFetching) || (scores.isError && !scores.isFetching);
  if (failed) {
    return {
      status: 'error',
      retry: () => {
        if (courses.isError) void courses.refetch();
        if (scores.isError) void scores.refetch();
      },
    };
  }
  if (!courses.data || !summaries) return { status: 'loading' };
  if (courses.data.status === 'pending') return { status: 'pending' };
  return { status: 'ready', source: courses.data.source, summaries };
}
