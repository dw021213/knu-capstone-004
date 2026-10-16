import { createContext } from 'react';

export interface SelectedDate {
  /** 서울 기준 'YYYY-MM-DD' */
  date: string;
  isToday: boolean;
  /** 지난 날짜는 무시한다 */
  setDate(d: string): void;
  /** 백엔드 at 값 'YYYY-MM-DDTHH:00': 고른 날짜 + 서울의 지금 시 */
  atParam(): string;
}

export const SelectedDateContext = createContext<SelectedDate | null>(null);
