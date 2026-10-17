import type { DataSource } from '../../data/types';

// 배포본은 날씨를 반영하지 않는다. api 모드의 기상 가산은 AWS 관측 기반이라 미래 날짜에는 들어가지 않는다
export const DATE_NOTICE: Record<DataSource['mode'], string> = {
  snapshot: '날씨 미반영 · 공간 점수는 날짜와 무관',
  api: '날씨는 오늘 관측값만 반영',
};
