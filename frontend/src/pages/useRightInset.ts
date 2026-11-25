import { useCallback, useState } from 'react';
import { isWide } from '../app/useBreakpoint';

/** 데스크톱 오른쪽 패널이 가리는 너비(px). 모바일은 0. 지도 맞춤을 그 왼쪽 영역에 한다 */
export function useRightInset() {
  const [right, setRight] = useState<number | null>(null);
  const measureSheet = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const measure = () =>
      setRight(isWide() ? Math.max(0, window.innerWidth - el.getBoundingClientRect().left) : 0);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [right, measureSheet] as const;
}
