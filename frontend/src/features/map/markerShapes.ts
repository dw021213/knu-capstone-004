/** 시설 마커 모양. 지도 canvas(Path2D)와 패널 아이콘(SVG)이 같은 경로를 쓴다 */
export type MarkerShape = 'square' | 'circle' | 'house' | 'diamond' | 'triangle';

/** 중심 (0, 0), 반지름 약 8px 안의 SVG 경로 */
export const SHAPE_PATH: Record<MarkerShape, string> = {
  square: 'M-6.5-6.5H6.5V6.5H-6.5Z',
  circle: 'M7.5 0A7.5 7.5 0 1 1-7.5 0A7.5 7.5 0 1 1 7.5 0Z',
  house: 'M0-8L8-1.5V7.5H-8V-1.5Z',
  diamond: 'M0-8.5L8.5 0L0 8.5L-8.5 0Z',
  triangle: 'M0-8L8.5 7H-8.5Z',
};
