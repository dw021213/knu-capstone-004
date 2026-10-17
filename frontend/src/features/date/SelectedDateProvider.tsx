import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { kstNow } from './kst';
import { SelectedDateContext, type SelectedDate } from './selectedDateContext';

/** 고른 날짜를 칩·달력·점수 요청이 함께 본다 */
export function SelectedDateProvider({ children }: { children: ReactNode }) {
  // null = 오늘(자정을 넘기면 새 오늘을 따른다)
  const [picked, setPicked] = useState<string | null>(null);
  const today = kstNow().date;
  const date = picked !== null && picked > today ? picked : today;

  const setDate = useCallback((d: string) => {
    const now = kstNow().date;
    if (d < now) return;
    setPicked(d === now ? null : d);
  }, []);

  const value = useMemo<SelectedDate>(
    () => ({
      date,
      isToday: date === today,
      setDate,
      atParam: () => `${date}T${String(kstNow().hour).padStart(2, '0')}:00`,
    }),
    [date, today, setDate],
  );

  return <SelectedDateContext.Provider value={value}>{children}</SelectedDateContext.Provider>;
}
