// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  COURSE_KINDS,
  COURSE_TABS,
  TAB_ORDER,
  kindOfId,
  kindsOfTab,
  tabFromSearch,
  tabHref,
} from './kinds';

describe('탭 주소', () => {
  it('탭은 올레 코스, 내 코스 순이고 처음 탭은 올레, 주소에 ?tab= 이 없다', () => {
    expect(TAB_ORDER.map((t) => COURSE_TABS[t].label)).toEqual(['올레 코스', '내 코스']);
    expect(tabFromSearch(new URLSearchParams(''))).toBe('olle');
    expect(tabHref('olle')).toBe('/courses');
    expect(tabHref('mine')).toBe('/courses?tab=mine');
  });

  it('탭마다 주소를 오가도 같은 탭', () => {
    for (const t of TAB_ORDER) {
      const search = new URL(tabHref(t), 'http://x').searchParams;
      expect(tabFromSearch(search)).toBe(t);
    }
  });

  it('모르는 값, 예전 인문학 탭, 탭이 아닌 코스 종류(?tab=example)는 기본 탭', () => {
    expect(tabFromSearch(new URLSearchParams('tab=xyz'))).toBe('olle');
    expect(tabFromSearch(new URLSearchParams('tab=toString'))).toBe('olle');
    expect(tabFromSearch(new URLSearchParams('tab=humanities'))).toBe('olle');
    expect(tabFromSearch(new URLSearchParams('tab=example'))).toBe('olle');
  });
});

describe('코스 종류', () => {
  it('내 코스 탭에는 내 코스 다음에 예시 코스 묶음이 있다', () => {
    expect(kindsOfTab('olle')).toEqual(['olle']);
    expect(kindsOfTab('mine')).toEqual(['mine', 'example']);
    expect(COURSE_KINDS.example.heading).toBe('예시 코스');
    expect(COURSE_KINDS.example.tag).toBe('예시 · 확정 전');
    expect(COURSE_KINDS.example.notice).toContain('확정 전');
  });

  it('/courses/:id 의 종류를 id로 고르고, 예전 인문학 코스 id는 모른다', () => {
    expect(kindOfId('olle-1')).toBe('olle');
    expect(kindOfId('hum-03')).toBeNull();
    expect(kindOfId('hum-01-day2')).toBeNull();
    expect(kindOfId('mine')).toBeNull();
    expect(kindOfId('x-1')).toBeNull();
  });

  it('상세 주소는 종류마다 따로라 내 코스 id와 겹치지 않는다', () => {
    expect(COURSE_KINDS.mine.href('abc')).toBe('/courses/mine/abc');
    expect(COURSE_KINDS.example.href('hum-01-day2')).toBe('/courses/examples/hum-01-day2');
    expect(COURSE_KINDS.olle.href('olle-1')).toBe('/courses/olle-1');
  });
});
