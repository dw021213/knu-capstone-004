import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Legend } from './Legend';

function stubWidth(desktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: desktop && q.includes('min-width'), media: q })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('범례 기준 문구', () => {
  it('snapshot 모드는 날짜와 무관한 공간 점수라고 적는다', () => {
    stubWidth(true);
    render(<Legend mode="snapshot" />);
    expect(screen.getByText('교통사고 도로 모델 · 날짜와 무관한 공간 점수')).toBeInTheDocument();
  });

  it('api 모드는 기상 가산이 들어간 값이라 날짜와 무관하다고 적지 않는다', () => {
    stubWidth(true);
    render(<Legend mode="api" />);
    expect(screen.getByText('교통사고 도로 모델 · 기상 가산 반영')).toBeInTheDocument();
    expect(screen.queryByText(/날짜와 무관/)).toBeNull();
  });
});

describe('처음 펼침 여부', () => {
  it('768px 미만이면 접혀 있다', () => {
    stubWidth(false);
    render(<Legend mode="snapshot" />);
    expect(screen.getByRole('button', { name: /위험도 범례/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('768px 이상이면 펼쳐 있다', () => {
    stubWidth(true);
    render(<Legend mode="snapshot" />);
    expect(screen.getByRole('button', { name: /위험도 범례/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
