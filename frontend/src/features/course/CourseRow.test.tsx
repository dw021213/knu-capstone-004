import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CourseSummary } from '../../entities/course/summary';
import { CourseRow } from './CourseRow';

afterEach(cleanup);

const summary = (p: Partial<CourseSummary>): CourseSummary => ({
  course: { id: 'olle-9', name: '제주올레 9코스', lengthKm: 12.34, coords: [] },
  segments: [],
  level: 3,
  caution: [],
  cautionKm: 0,
  noDataRatio: 0,
  ...p,
});

const renderRow = (s: CourseSummary) =>
  render(
    <MemoryRouter>
      <ol>
        <CourseRow summary={s} />
      </ol>
    </MemoryRouter>,
  );

describe('CourseRow', () => {
  it('배지·이름·길이·한 줄 이유를 보이고 상세로 연결한다', () => {
    renderRow(summary({}));
    expect(screen.getByTestId('level-badge')).toHaveTextContent('3 · 보통');
    expect(screen.getByRole('heading', { name: '제주올레 9코스' })).toBeInTheDocument();
    expect(screen.getByText('12.3km')).toBeInTheDocument();
    expect(screen.getByText('주의 구간 없음 · 가장 위험한 구간 3단계')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/courses/olle-9');
    expect(screen.queryByText(/데이터 부족 구간/)).toBeNull();
  });

  it('등급을 모르면 배지에 데이터 부족, 데이터 부족 구간이 많으면 따로 한 줄', () => {
    renderRow(summary({ level: null, noDataRatio: 1 }));
    const badge = screen.getByTestId('level-badge');
    expect(badge).toHaveTextContent('데이터 부족');
    expect(badge).toHaveAttribute('data-level', 'none');
    expect(screen.getByText('데이터 부족 구간 100% (도로 자료 미확인)')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveAttribute('data-level', 'none');
  });

  it('데이터 부족 구간이 30%면 그 줄을 보인다', () => {
    renderRow(summary({ noDataRatio: 0.3 }));
    expect(screen.getByText('데이터 부족 구간 30% (도로 자료 미확인)')).toBeInTheDocument();
  });
});
