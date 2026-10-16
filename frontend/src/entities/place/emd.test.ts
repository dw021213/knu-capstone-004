// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { placeAt, placeLabel, searchEmd, type EmdFile } from './emd';

const emd = JSON.parse(
  readFileSync(new URL('../../../public/data/emd.json', import.meta.url), 'utf8'),
) as EmdFile;
const items = emd.items;

describe('placeAt', () => {
  it.each([
    [[126.5312, 33.4996], '제주시 이도2동'],
    [[126.493, 33.5113], '제주시 용담2동'],
    [[126.9425, 33.459], '서귀포시 성산읍'],
    [[126.953, 33.506], '제주시 우도면'],
    [[126.3, 33.96], '제주시 추자면'],
  ] as [[number, number], string][])('%j는 %s 안', (p, label) => {
    const got = placeAt(items, p)!;
    expect(got.inside).toBe(true);
    expect(placeLabel(got)).toBe(label);
  });

  it('어느 경계에도 들지 않으면(바다) 가장 가까운 읍면동 이름에 근처를 붙인다', () => {
    // 한림항 북쪽 바다
    const got = placeAt(items, [126.26, 33.43])!;
    expect(got.inside).toBe(false);
    expect(got.item.name).toBe('한림읍');
    expect(placeLabel(got)).toBe('제주시 한림읍 근처');
  });

  it('목록이 비면 null', () => {
    expect(placeAt([], [126.5, 33.5])).toBeNull();
  });
});

describe('searchEmd', () => {
  it('이름 일부로 찾고, 앞이 맞는 것을 먼저 둔다', () => {
    expect(searchEmd(items, '애월').map((i) => i.name)).toEqual(['애월읍']);
    const names = searchEmd(items, '도').map((i) => i.name);
    // '도'로 시작하는 곳은 도두동 하나
    expect(names[0]).toBe('도두동');
    expect(names.length).toBeGreaterThan(1);
    expect(names.every((n) => n.includes('도'))).toBe(true);
  });

  it('최대 8개', () => {
    expect(searchEmd(items, '동').length).toBe(8);
  });

  it('시 이름과 띄어쓰기를 함께 써도 찾는다', () => {
    expect(searchEmd(items, '서귀포시 성산').map((i) => i.name)).toEqual(['성산읍']);
    expect(searchEmd(items, '이도 2동').map((i) => i.name)).toEqual(['이도2동']);
  });

  it('빈 입력과 없는 이름은 빈 목록', () => {
    expect(searchEmd(items, '  ')).toEqual([]);
    expect(searchEmd(items, '서울')).toEqual([]);
  });
});
