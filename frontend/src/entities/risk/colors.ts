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

/** 코스 경로: 흰(tokens.css --white) 밑선 위에 구간 등급 색 선. 두께는 화면 px */
export const ROUTE_UNDER_WIDTH = 10;
export const ROUTE_WIDTH = 6;
/** 데이터 부족 구간은 회색 점선(안전처럼 보이는 색을 쓰지 않는다) */
export const ROUTE_NO_DATA_COLOR = NO_DATA_HATCH_COLOR;
export const ROUTE_NO_DATA_DASH = [6, 5];

/** 주의 구간 지점(멘토 회의: 위험 지점만 빨간 점) */
export const CAUTION_MARK_COLOR = RISK_COLOR[5];
export const CAUTION_MARK_RADIUS = 11;
