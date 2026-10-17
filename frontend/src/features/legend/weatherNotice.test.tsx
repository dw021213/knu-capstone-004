import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiSource } from '../../data/api';
import { createSnapshotSource } from '../../data/snapshot';
import type { DataSource } from '../../data/types';
import {
  API_BASE,
  SNAPSHOT_BASE,
  gridJson,
  handlers,
  type WeatherStatus,
} from '../../data/mocks/backend';
import { DateChips } from '../date/DateChips';
import { SelectedDateProvider } from '../date/SelectedDateProvider';
import { useScores } from '../../pages/useScores';
import { Legend } from './Legend';

// api 모드에서 백엔드가 그 시각 기상 관측이 없다고(weather.status) 알리면 범례 아래에 '날씨 미반영'을 띄운다
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  // 모바일 폭: 범례가 접혀 있어도 보여야 한다
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: false, media: q })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  server.resetHandlers();
});
afterAll(() => server.close());

function Probe({ source }: { source: DataSource }) {
  const { data } = useScores(source);
  return (
    <>
      <Legend mode={source.mode} weather={data?.weather} />
      <DateChips mode={source.mode} weather={data?.weather} />
      <output data-testid="weather">{data?.weather ?? ''}</output>
    </>
  );
}

function renderWith(source: DataSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SelectedDateProvider>
        <Probe source={source} />
      </SelectedDateProvider>
    </QueryClientProvider>,
  );
}

function grid(status: WeatherStatus) {
  server.use(http.get(`${API_BASE}/api/grid`, () => HttpResponse.json(gridJson(status))));
}

describe('U7-4 api 모드 날씨 미반영', () => {
  it.each([
    ['no_data', '날씨 미반영 · 이 시각 관측 없음'],
    ['off', '날씨 미반영'],
  ] as const)(
    'weather.status %s면 접힌 범례 아래에 날씨 미반영을 띄우고 칩 안내와 겹치지 않는다',
    async (status, text) => {
      grid(status);
      renderWith(createApiSource(API_BASE, SNAPSHOT_BASE));
      const legend = screen.getByRole('region', { name: '위험도 범례' });
      const notice = await within(legend).findByTestId('weather-notice');
      expect(notice.textContent).toBe(text);
      expect(notice).toBeVisible();
      expect(within(legend).getByRole('button', { name: /위험도 범례/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      // 칩 위 '오늘 관측값만 반영' 안내와 범례 기준 '기상 가산 반영'은 사실이 아니므로 내린다
      expect(screen.queryByText('날씨는 오늘 관측값만 반영')).toBeNull();
      expect(screen.queryByText(/기상 가산 반영/)).toBeNull();
    },
  );

  it('weather.status ok면 날씨 미반영을 띄우지 않는다', async () => {
    grid('ok');
    renderWith(createApiSource(API_BASE, SNAPSHOT_BASE));
    await screen.findByText('on');
    expect(screen.queryByTestId('weather-notice')).toBeNull();
    expect(screen.getByText('날씨는 오늘 관측값만 반영')).toBeInTheDocument();
  });

  it('snapshot 모드는 칩 위 안내 하나만 두고 범례 아래에는 띄우지 않는다', async () => {
    renderWith(createSnapshotSource(SNAPSHOT_BASE));
    await screen.findByText('off');
    expect(screen.queryByTestId('weather-notice')).toBeNull();
    expect(screen.getByText('날씨 미반영 · 공간 점수는 날짜와 무관')).toBeInTheDocument();
  });
});
