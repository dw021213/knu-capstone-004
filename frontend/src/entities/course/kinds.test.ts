// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { COURSE_KINDS, COURSE_TABS, kindOfId, tabFromSearch, tabHref } from './kinds';

describe('탭 주소', () => {
  it('탭은 올레 코스, 내 코스 순이고 처음 탭은 올레, 주소에 ?tab= 이 없다', () => {
    expect(COURSE_TABS.map((k) => COURSE_KINDS[k].tab)).toEqual(['올레 코스', '내 코스']);
    expect(tabFromSearch(new URLSearchParams(''))).toBe('olle');
    expect(tabHref('olle')).toBe('/courses');
    expect(tabHref('mine')).toBe('/courses?tab=mine');
  });

  it('탭마다 주소를 오가도 같은 탭', () => {
    for (const k of COURSE_TABS) {
      const search = new URL(tabHref(k), 'http://x').searchParams;
      expect(tabFromSearch(search)).toBe(k);
    }
  });

  it('모르는 값과 예전 인문학 탭(?tab=humanities)은 기본 탭', () => {
    expect(tabFromSearch(new URLSearchParams('tab=xyz'))).toBe('olle');
    expect(tabFromSearch(new URLSearchParams('tab=toString'))).toBe('olle');
    expect(tabFromSearch(new URLSearchParams('tab=humanities'))).toBe('olle');
  });
});

describe('코스 종류', () => {
  it('/courses/:id 의 종류를 id로 고르고, 예전 인문학 코스 id는 모른다', () => {
    expect(kindOfId('olle-1')).toBe('olle');
    expect(kindOfId('hum-03')).toBeNull();
    expect(kindOfId('mine')).toBeNull();
    expect(kindOfId('x-1')).toBeNull();
  });

  it('내 코스만 고칠 수 있고 상세 주소가 따로다', () => {
    expect(COURSE_TABS.filter((k) => COURSE_KINDS[k].editable)).toEqual(['mine']);
    expect(COURSE_KINDS.mine.href('abc')).toBe('/courses/mine/abc');
    expect(COURSE_KINDS.olle.href('olle-1')).toBe('/courses/olle-1');
  });
});
