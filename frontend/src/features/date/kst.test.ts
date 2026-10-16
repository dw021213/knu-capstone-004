// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addDays, chipLabel, kstNow, monthCells, shortLabel } from './kst';

describe('서울 시각', () => {
  it.each([
    ['2026-10-16T16:30:00Z', '2026-10-17', 1],
    ['2026-10-17T14:59:00Z', '2026-10-17', 23],
    // 자정은 24가 아니라 0시
    ['2026-10-17T15:00:00Z', '2026-10-18', 0],
    ['2026-12-31T15:10:00Z', '2027-01-01', 0],
  ])('%s → %s %i시', (iso, date, hour) => {
    expect(kstNow(new Date(iso))).toEqual({ date, hour });
  });
});

describe('칩 문구', () => {
  it.each([
    ['2026-10-20', '10월 20일 (화)'],
    ['2026-10-17', '10월 17일 (토)'],
    ['2026-11-01', '11월 1일 (일)'],
  ])('%s → %s', (d, label) => {
    expect(chipLabel(d)).toBe(label);
  });

  it('짧은 문구는 월·일만', () => {
    expect(shortLabel('2026-10-22')).toBe('10월 22일');
  });
});

describe('날짜 더하기', () => {
  it.each([
    ['2026-10-17', 5, '2026-10-22'],
    ['2026-10-30', 3, '2026-11-02'],
    ['2026-12-30', 2, '2027-01-01'],
    ['2026-10-17', 0, '2026-10-17'],
  ])('%s + %i일 = %s', (d, n, out) => {
    expect(addDays(d, n)).toBe(out);
  });
});

describe('달력 칸', () => {
  it('2026년 10월은 목요일에 시작해 앞 칸 4개가 비고 31일까지', () => {
    const cells = monthCells(2026, 10);
    expect(cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(cells[4]).toBe('2026-10-01');
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells[cells.length - 1]).toBe('2026-10-31');
  });

  it('2027년 2월은 28일까지', () => {
    expect(monthCells(2027, 2).filter(Boolean)).toHaveLength(28);
  });
});
