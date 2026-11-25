import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Segment } from '../../entities/course/segments';
import { summarize, type CourseSummary } from '../../entities/course/summary';
import type { Level } from '../../entities/risk/level';
import { CourseRow } from './CourseRow';

afterEach(cleanup);

const seg = (index: number, level: Level | null, startKm: number, endKm: number): Segment => ({
  index,
  h3: `h${index}`,
  level,
  startKm,
  endKm,
  coords: [],
});
const summary = (segs: Segment[]): CourseSummary =>
  summarize({ id: 'olle-9', name: '제주올레 9코스', lengthKm: 12.34, coords: [] }, segs);

const renderRow = (s: CourseSummary, props: { meta?: string[]; tag?: string } = {}) =>
  render(
    <MemoryRouter>
      <ol>
        <CourseRow summary={s} href={`/courses/${s.course.id}`} {...props} />
      </ol>
    </MemoryRouter>,
  );

describe('CourseRow', () => {
  it('이름, 색 띠, 길이와 주의할 구간 수를 보이고 상세로 연결한다. 코스 등급은 없다', () => {
    renderRow(summary([seg(0, 2, 0, 4), seg(1, 5, 4, 5), seg(2, 1, 5, 8), seg(3, 4, 8, 12.34)]));
    expect(screen.getByRole('heading', { name: '제주올레 9코스' })).toBeInTheDocument();
    expect(screen.getByText('12.3km · 주의할 구간 2곳')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/courses/olle-9');
    const band = screen.getByTestId('risk-band');
    // 같은 내용을 글이 말하므로 화면 읽기에서는 숨긴다
    expect(band).toHaveAttribute('aria-hidden', 'true');
    expect(band.children).toHaveLength(4);
    expect(screen.getByRole('listitem')).not.toHaveTextContent(/단계|매우 높음|코스 등급/);
    expect(screen.queryByText(/도로 자료/)).toBeNull();
  });

  it('주의할 구간이 없으면 없다고, 데이터 부족 구간이 많으면 숫자 없이 한 줄', () => {
    renderRow(summary([seg(0, 2, 0, 6), seg(1, null, 6, 12.34)]));
    expect(screen.getByText('12.3km · 주의할 구간 없음')).toBeInTheDocument();
    expect(screen.getByText('도로 자료가 확인되지 않은 구간이 많아요')).toBeInTheDocument();
  });

  it('길이 앞 정보와 이름 옆 표지', () => {
    renderRow(summary([seg(0, 3, 0, 12.34)]), {
      meta: ['장소 3곳', '직선 연결'],
      tag: '예시 · 확정 전',
    });
    expect(
      screen.getByText('장소 3곳 · 직선 연결 · 12.3km · 주의할 구간 없음'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent('제주올레 9코스예시 · 확정 전');
  });
});
