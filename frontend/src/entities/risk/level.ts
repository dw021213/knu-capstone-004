export type Level = 1 | 2 | 3 | 4 | 5;

export const LEVEL_NAME: Record<Level, string> = {
  1: '매우 낮음',
  2: '낮음',
  3: '보통',
  4: '높음',
  5: '매우 높음',
};

/** 교통 모델 백분위(0~100) → 5단계 등급. 백분위가 없으면 null(데이터 부족). */
export function levelFromPercentile(p: number | null): Level | null {
  if (p === null || Number.isNaN(p)) return null;
  if (p >= 90) return 5;
  if (p >= 70) return 4;
  if (p >= 30) return 3;
  if (p >= 10) return 2;
  return 1;
}
