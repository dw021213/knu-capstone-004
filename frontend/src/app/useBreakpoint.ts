import { useSyncExternalStore } from 'react';

/**
 * 데스크톱 배치(오른쪽 패널, 펼친 범례 카드)를 쓰는 너비. 768px까지는 모바일 배치다.
 * CSS 미디어 쿼리 `(min-width: 769px)`와 같은 기준이다
 */
export const WIDE_MIN = 769;
export const WIDE_QUERY = `(min-width: ${WIDE_MIN}px)`;

export const isWide = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches;

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** 지금 데스크톱 배치인지. 창 너비가 기준을 넘나들면 다시 그린다 */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, isWide, () => false);
}
