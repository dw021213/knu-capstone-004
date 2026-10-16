import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DateChips } from '../features/date/DateChips';
import { SelectedDateProvider } from '../features/date/SelectedDateProvider';
import { useScores } from '../pages/useScores';
import { createApiSource } from './api';
import { createSnapshotSource } from './snapshot';
import type { DataSource } from './types';
import { API_BASE, SNAPSHOT_BASE, handlers, seen, snapshotScoresJson } from './mocks/backend';

// UI(날짜 칩·달력)에서 고른 날짜가 점수 요청까지 이어지는지 본다
const gridAts: (string | null)[] = [];
let snapshotHits = 0;
const server = setupServer(
  http.get(`${API_BASE}/api/grid`, ({ request }) => {
    gridAts.push(new URL(request.url).searchParams.get('at'));
  }),
  http.get(`${SNAPSHOT_BASE}/data/scores.json`, () => {
    snapshotHits++;
    return HttpResponse.json(snapshotScoresJson);
  }),
  ...handlers,
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T01:00:00Z')); // 서울 10월 17일 10시
  gridAts.length = 0;
  snapshotHits = 0;
  seen.gridUrl = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  server.resetHandlers();
});
afterAll(() => server.close());

function Probe({ source }: { source: DataSource }) {
  const { data } = useScores(source);
  return <output data-testid="cells">{data ? data.cells.size : ''}</output>;
}

function renderWith(source: DataSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SelectedDateProvider>
        <DateChips mode={source.mode} />
        <Probe source={source} />
      </SelectedDateProvider>
    </QueryClientProvider>,
  );
}

async function pick(label: string) {
  await userEvent.click(screen.getByRole('button', { name: '날짜 선택' }));
  // 날짜 칸 이름은 보이는 숫자로 시작한다: '20, 10월 20일 (화)'
  const day = label.match(/(\d+)일/)![1];
  await userEvent.click(screen.getByRole('button', { name: `${day}, ${label}` }));
  await userEvent.click(screen.getByRole('button', { name: `${label} 보기` }));
}

describe('api 모드: 고른 날짜를 at으로 싣는다', () => {
  it('처음은 오늘 지금 시각, 날짜를 고르면 그 날짜로 다시 받는다', async () => {
    renderWith(createApiSource(API_BASE, SNAPSHOT_BASE));
    await waitFor(() => expect(seen.gridUrl?.searchParams.get('at')).toBe('2026-10-17T10:00'));
    expect(seen.gridUrl?.searchParams.get('weather')).toBe('on');
    await waitFor(() => expect(screen.getByTestId('cells')).not.toHaveTextContent(''));

    await pick('10월 20일 (화)');
    await waitFor(() => expect(seen.gridUrl?.searchParams.get('at')).toBe('2026-10-20T10:00'));
    expect(gridAts).toEqual(['2026-10-17T10:00', '2026-10-20T10:00']);
    // 다시 받는 동안에도 앞 점수를 그대로 보여 준다
    expect(screen.getByTestId('cells')).not.toHaveTextContent('');

    await userEvent.click(screen.getByRole('button', { name: '오늘' }));
    await waitFor(() => expect(seen.gridUrl?.searchParams.get('at')).toBe('2026-10-17T10:00'));
  });
});

describe('snapshot 모드: 날짜와 무관한 점수라 다시 받지 않는다', () => {
  it('날짜를 바꿔도 점수 파일은 한 번만 받는다', async () => {
    renderWith(createSnapshotSource(SNAPSHOT_BASE));
    await waitFor(() => expect(screen.getByTestId('cells')).not.toHaveTextContent(''));
    await pick('10월 20일 (화)');
    await new Promise((r) => setTimeout(r, 50));
    expect(snapshotHits).toBe(1);
    expect(gridAts).toEqual([]);
  });
});

describe('날씨 미반영 안내', () => {
  it('snapshot 모드는 칩 위에 안내를 보인다', () => {
    renderWith(createSnapshotSource(SNAPSHOT_BASE));
    expect(screen.getByText('날씨 미반영 · 공간 점수는 날짜와 무관')).toBeInTheDocument();
  });

  it('api 모드는 안내를 보이지 않는다', () => {
    renderWith(createApiSource(API_BASE, SNAPSHOT_BASE));
    expect(screen.queryByText('날씨 미반영 · 공간 점수는 날짜와 무관')).toBeNull();
  });
});
