// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { latLngToCell } from 'h3-js';
import { cellAt } from './hitTest';

const scores = JSON.parse(
  readFileSync(new URL('../../../public/data/scores.json', import.meta.url), 'utf8'),
) as { cells: Record<string, unknown> };
const known = new Set(Object.keys(scores.cells));

describe('cellAt', () => {
  it('제주공항 좌표는 그 res8 셀', () => {
    expect(cellAt(126.493, 33.5113, known)).toBe(latLngToCell(33.5113, 126.493, 8));
  });

  it('격자 밖 바다(126.3, 33.7)는 null', () => {
    expect(cellAt(126.3, 33.7, known)).toBeNull();
  });

  it('Map도 받는다', () => {
    const map = new Map([[latLngToCell(33.5113, 126.493, 8), 1]]);
    expect(cellAt(126.493, 33.5113, map)).toBe(latLngToCell(33.5113, 126.493, 8));
  });
});
