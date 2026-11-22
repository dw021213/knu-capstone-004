import { afterEach, describe, it, expect } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Candidate } from './localSearch';
import { IDLE, searchReducer, type SearchState } from './searchState';
import { StopSearch } from './StopSearch';

afterEach(cleanup);

const AIRPORT: Candidate = {
  key: 'kakao-1',
  name: '제주국제공항',
  category: '공항',
  address: '제주특별자치도 제주시 공항로 2',
  lat: 33.507,
  lng: 126.493,
  source: 'kakao',
};

function Harness() {
  const [state, setState] = useState<SearchState>(IDLE);
  return (
    <>
      <StopSearch
        state={state}
        dispatch={(a) => setState((s) => searchReducer(s, a))}
        suggestions={state.query.trim() ? [AIRPORT] : []}
        kakaoOn
      />
      <output data-testid="mode">{state.mode}</output>
    </>
  );
}

const setup = () => {
  render(<Harness />);
  const input = screen.getByRole('combobox', { name: '장소 검색' });
  fireEvent.focus(input);
  return input;
};
const mode = () => screen.getByTestId('mode').textContent;

describe('StopSearch 엔터', () => {
  it('한글 조합을 확정하는 엔터는 무시하고, 그 뒤 엔터는 장소를 고르지 않고 검색 결과로 간다', () => {
    const input = setup();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '공항' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(mode()).toBe('suggest');
    fireEvent.compositionEnd(input, { data: '공항' });
    // Safari는 확정 뒤에 keyCode 229 엔터를 한 번 더 보낸다
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(mode()).toBe('suggest');
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(mode()).toBe('results');
    expect(input).toHaveValue('공항');
  });

  it('추천 후보는 화살표로 고르고 엔터를 쳐야 그 장소 카드가 된다', () => {
    const input = setup();
    fireEvent.change(input, { target: { value: '공항' } });
    expect(screen.getByRole('option', { name: /제주국제공항/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const option = screen.getByRole('option', { name: /제주국제공항/ });
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mode()).toBe('place');
  });

  it('추천 줄의 이름은 검색어와 맞는 부분만 굵게', () => {
    const input = setup();
    fireEvent.change(input, { target: { value: '공항' } });
    expect(screen.getByRole('option').querySelector('strong')).toHaveTextContent(/^공항$/);
  });
});
