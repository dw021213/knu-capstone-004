// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Candidate } from './localSearch';
import { IDLE, searchReducer, type SearchAction, type SearchState } from './searchState';

const place = (name: string): Candidate => ({
  key: name,
  name,
  category: '공항',
  address: '제주시',
  lat: 33.5,
  lng: 126.5,
  source: 'kakao',
});
const run = (...actions: SearchAction[]) =>
  actions.reduce<SearchState>((s, a) => searchReducer(s, a), IDLE);
const typed = { type: 'type', query: '공항' } as const;

describe('searchReducer', () => {
  it('입력하면 추천, 지우면 편집 화면', () => {
    expect(run(typed)).toEqual({ mode: 'suggest', query: '공항', active: -1 });
    expect(run(typed, { type: 'type', query: ' ' }).mode).toBe('idle');
  });

  it('고른 추천이 없을 때 엔터와 검색 버튼은 검색 결과 1쪽', () => {
    const results = { mode: 'results', query: '공항', page: 1, selected: null };
    expect(run(typed, { type: 'enter', suggestions: [place('제주국제공항')] })).toEqual(results);
    expect(run(typed, { type: 'submit' })).toEqual(results);
    expect(run({ type: 'enter', suggestions: [] })).toEqual(IDLE);
  });

  it('추천을 고르면 장소 카드(코스에 넣지 않는다)', () => {
    const airport = place('제주국제공항');
    const list = [place('정석비행장'), airport];
    const picked = run(
      typed,
      { type: 'move', by: -1, count: 2 },
      { type: 'enter', suggestions: list },
    );
    expect(picked).toEqual({ mode: 'place', query: '공항', place: airport });
    expect(run(typed, { type: 'choose', place: airport }).mode).toBe('place');
  });

  it('화살표는 추천 끝에서 처음으로 돌고, Esc는 추천만 닫는다', () => {
    const s = run(typed, ...Array(3).fill({ type: 'move', by: 1, count: 2 }));
    expect(s).toMatchObject({ mode: 'suggest', active: 0 });
    expect(searchReducer(s, { type: 'escape' })).toEqual({ mode: 'idle', query: '공항' });
  });

  it('결과에서 고르기·쪽 넘기기, 빈 곳 누르기는 고른 것만 푼다', () => {
    const r = run(typed, { type: 'submit' }, { type: 'select', index: 3 });
    expect(r).toMatchObject({ mode: 'results', selected: 3 });
    expect(searchReducer(r, { type: 'tap', place: place('x') })).toMatchObject({
      mode: 'results',
      selected: null,
    });
    expect(searchReducer(r, { type: 'page', page: 2 })).toMatchObject({ page: 2, selected: null });
  });

  it('지도를 누르면 그 자리 카드, 다른 곳을 누르면 옮겨 가고, Esc·닫기는 편집 화면', () => {
    const a = run({ type: 'tap', place: place('A 지점') });
    expect(a).toMatchObject({ mode: 'place', place: { name: 'A 지점' } });
    expect(searchReducer(a, { type: 'tap', place: place('B 지점') })).toMatchObject({
      place: { name: 'B 지점' },
    });
    expect(searchReducer(a, { type: 'escape' })).toEqual(IDLE);
    expect(run(typed, { type: 'submit' }, { type: 'close' })).toEqual(IDLE);
  });
});
