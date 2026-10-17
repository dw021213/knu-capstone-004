// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RISK_COLOR, NO_DATA_COLOR, CELL_FILL_OPACITY } from './colors';

const css = readFileSync(new URL('../../app/styles/tokens.css', import.meta.url), 'utf8');

function token(name: string): string | undefined {
  return css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim();
}

describe('위험 색', () => {
  it('Figma 램프와 같다', () => {
    expect(RISK_COLOR).toEqual({
      1: '#9FD39A',
      2: '#D7E47E',
      3: '#F5C451',
      4: '#EC8239',
      5: '#C0313A',
    });
    expect(NO_DATA_COLOR).toBe('#BDBDBD');
    expect(CELL_FILL_OPACITY).toBe(0.5);
  });

  it.each([1, 2, 3, 4, 5] as const)('등급 %s 색이 tokens.css --risk-%s와 같다', (lv) => {
    expect(token(`--risk-${lv}`)?.toUpperCase()).toBe(RISK_COLOR[lv].toUpperCase());
  });

  it('데이터 부족 색과 채움 불투명도가 tokens.css와 같다', () => {
    expect(token('--risk-none')?.toUpperCase()).toBe(NO_DATA_COLOR.toUpperCase());
    expect(Number(token('--risk-fill-opacity'))).toBe(CELL_FILL_OPACITY);
  });
});
