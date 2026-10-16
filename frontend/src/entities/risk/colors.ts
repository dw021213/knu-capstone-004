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
