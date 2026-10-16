import type { Level } from './level';

// canvas에 칠할 값이라 CSS 변수 대신 상수로 둔다. tokens.css의 --risk-* 와 같아야 한다(colors.test.ts).
export const RISK_COLOR: Record<Level, string> = {
  1: '#9FD39A',
  2: '#D7E47E',
  3: '#F5C451',
  4: '#EC8239',
  5: '#C0313A',
};

/** 데이터 부족 셀은 이 회색에 빗금을 친다. 안전처럼 보이는 색을 쓰지 않는다. */
export const NO_DATA_COLOR = '#BDBDBD';

export const CELL_FILL_OPACITY = 0.5;

/** 코스 화면에서 경로가 지나지 않는 셀의 채움 불투명도(멘토 회의: 나머지는 가린다) */
export const DIM_FILL_OPACITY = 0.15;

/** 데이터 부족 빗금 선. 바탕(NO_DATA_COLOR)보다 진한 회색 */
export const NO_DATA_HATCH_COLOR = '#8E8E8E';

/** 셀 경계선: 흰색(tokens.css --white), 화면 기준 0.5px */
export const CELL_STROKE_COLOR = '#FFFFFF';
export const CELL_STROKE_WIDTH = 0.5;

/** 선택한 셀 테두리(tokens.css --ink) */
export const SELECTED_STROKE_COLOR = '#111111';
