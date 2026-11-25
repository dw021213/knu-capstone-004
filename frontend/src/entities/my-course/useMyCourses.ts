import { useSyncExternalStore } from 'react';
import { readCourses, subscribe, type MyCourse } from './store';

const NONE: MyCourse[] = [];

/** 이 기기에 저장한 내 코스. 저장·삭제(다른 탭 포함)하면 다시 그린다 */
export function useMyCourses(): MyCourse[] {
  return useSyncExternalStore(subscribe, readCourses, () => NONE);
}
