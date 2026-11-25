import type { DataSource } from '../../data/types';
import { addDays, shortLabel } from './kst';

// 배포본은 날씨를 반영하지 않는다. api 모드의 기상 가산은 AWS 관측 기반이라 미래 날짜에는 들어가지 않는다
export const DATE_NOTICE: Record<DataSource['mode'], string> = {
  snapshot: '날씨 미반영 · 공간 점수는 날짜와 무관',
  api: '날씨는 오늘 관측값만 반영',
};

/**
 * 코스 화면 안내 한 줄. 오늘은 모드 안내 그대로, 내일(이후)은 그날 날씨가 빠졌다고 먼저 밝힌다.
 * snapshot 모드는 원래 날씨를 쓰지 않으므로 '공간 점수는 날짜와 무관'을 이어 붙여 두 안내가 어긋나지 않게 한다
 */
export function courseDateNotice(mode: DataSource['mode'], date: string, today: string): string {
  if (date <= today) return DATE_NOTICE[mode];
  const when = date === addDays(today, 1) ? '내일' : shortLabel(date);
  const future = `${when} 날씨는 아직 반영되지 않았어요`;
  return mode === 'snapshot' ? `${future} · 공간 점수는 날짜와 무관` : future;
}
