// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function declared(name: string): string | undefined {
  const m = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return m?.[1].trim();
}

describe('tokens.css', () => {
  test.each([
    ['--risk-1', '#9FD39A'],
    ['--risk-2', '#D7E47E'],
    ['--risk-3', '#F5C451'],
    ['--risk-4', '#EC8239'],
    ['--risk-5', '#C0313A'],
    ['--risk-none', '#BDBDBD'],
  ])('위험 색 %s = %s', (name, hex) => {
    expect(declared(name)?.toUpperCase()).toBe(hex);
  });

  test.each([
    ['--ink', '#111111'],
    ['--ink2', '#62626B'],
    ['--line', '#D6D6DD'],
    ['--surf', '#F4F4F6'],
    ['--white', '#FFFFFF'],
  ])('UI 색 %s = %s', (name, hex) => {
    expect(declared(name)?.toUpperCase()).toBe(hex);
  });

  test('글꼴은 Noto Sans KR이 먼저다', () => {
    expect(declared('--font')).toBe("'Noto Sans KR', system-ui, sans-serif");
  });

  test.each([
    ['--space-1', '4px'],
    ['--space-2', '8px'],
    ['--space-3', '12px'],
    ['--space-4', '16px'],
    ['--space-6', '24px'],
    ['--radius-s', '8px'],
    ['--radius-m', '16px'],
    ['--radius-full', '999px'],
    ['--space-8', '32px'],
    ['--touch', '44px'],
    ['--text-xs', '12px'],
    ['--text-s', '14px'],
    ['--text-m', '16px'],
    ['--text-l', '18px'],
  ])('간격·반경 %s = %s', (name, value) => {
    expect(declared(name)).toBe(value);
  });

  test('시트 뒤 어둡게 하는 색은 ink를 섞어 만든다', () => {
    expect(declared('--scrim')).toBe('color-mix(in srgb, var(--ink) 40%, transparent)');
  });
});
