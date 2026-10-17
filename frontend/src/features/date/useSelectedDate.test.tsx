import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SelectedDateProvider } from './SelectedDateProvider';
import { useSelectedDate } from './useSelectedDate';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SelectedDateProvider>{children}</SelectedDateProvider>
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 서울 2026-10-17 01:30 (브라우저 시간대와 무관하게 서울 기준)
  vi.setSystemTime(new Date('2026-10-16T16:30:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useSelectedDate', () => {
  it('처음은 서울 기준 오늘', () => {
    const { result } = renderHook(() => useSelectedDate(), { wrapper });
    expect(result.current.date).toBe('2026-10-17');
    expect(result.current.isToday).toBe(true);
    expect(result.current.atParam()).toBe('2026-10-17T01:00');
  });

  it('날짜를 고르면 그 날짜와 지금 시각으로 at을 만든다', () => {
    const { result } = renderHook(() => useSelectedDate(), { wrapper });
    act(() => result.current.setDate('2026-10-20'));
    expect(result.current.date).toBe('2026-10-20');
    expect(result.current.isToday).toBe(false);
    expect(result.current.atParam()).toBe('2026-10-20T01:00');
  });

  it('at의 시각은 부를 때의 서울 시각이다', () => {
    const { result } = renderHook(() => useSelectedDate(), { wrapper });
    act(() => result.current.setDate('2026-10-20'));
    vi.setSystemTime(new Date('2026-10-17T05:10:00Z'));
    expect(result.current.atParam()).toBe('2026-10-20T14:00');
  });

  it('오늘을 다시 고르면 isToday', () => {
    const { result } = renderHook(() => useSelectedDate(), { wrapper });
    act(() => result.current.setDate('2026-10-20'));
    act(() => result.current.setDate('2026-10-17'));
    expect(result.current.isToday).toBe(true);
  });

  it('지난 날짜는 고를 수 없다', () => {
    const { result } = renderHook(() => useSelectedDate(), { wrapper });
    act(() => result.current.setDate('2026-10-16'));
    expect(result.current.date).toBe('2026-10-17');
  });

  it('같은 Provider 안의 사용처는 같은 날짜를 본다', () => {
    const { result } = renderHook(() => [useSelectedDate(), useSelectedDate()] as const, {
      wrapper,
    });
    act(() => result.current[0].setDate('2026-10-21'));
    expect(result.current[1].date).toBe('2026-10-21');
  });

  it('Provider 밖에서 쓰면 알려 준다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useSelectedDate())).toThrow(/SelectedDateProvider/);
  });
});
