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

describe('점수 기준 시각', () => {
  it('snapshot 모드는 펼친 범례 아래에 점수 파일 생성일(서울)을 적는다', () => {
    stubWidth(true);
    render(<Legend mode="snapshot" generatedAt="2026-10-12T09:47:48.581628+09:00" />);
    expect(screen.getByText('점수 기준 2026.10.12 생성')).toBeInTheDocument();
  });

  it('생성 시각은 서울 날짜로 바꿔 적는다', () => {
    stubWidth(true);
    render(<Legend mode="snapshot" generatedAt="2026-10-11T16:00:00Z" />);
    expect(screen.getByText('점수 기준 2026.10.12 생성')).toBeInTheDocument();
  });

  it('생성 시각이 없거나 api 모드면 적지 않는다', () => {
    stubWidth(true);
    render(<Legend mode="snapshot" />);
    render(<Legend mode="api" generatedAt="2026-10-12T09:47:48+09:00" />);
    expect(screen.queryByText(/점수 기준/)).toBeNull();
  });
});

describe('처음 펼침 여부', () => {
  it('768px 이하(모바일 배치)면 접혀 있다', () => {
    stubWidth(false);
    render(<Legend mode="snapshot" />);
    expect(screen.getByRole('button', { name: /위험도 범례/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('769px 이상(데스크톱 배치)이면 펼쳐 있다', () => {
    stubWidth(true);
    render(<Legend mode="snapshot" />);
    expect(screen.getByRole('button', { name: /위험도 범례/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
