import { useContext } from 'react';
import { SelectedDateContext, type SelectedDate } from './selectedDateContext';

export function useSelectedDate(): SelectedDate {
  const v = useContext(SelectedDateContext);
  if (!v) throw new Error('useSelectedDate는 SelectedDateProvider 안에서 써야 합니다');
  return v;
}
