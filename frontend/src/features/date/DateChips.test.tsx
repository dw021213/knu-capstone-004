import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateChips } from './DateChips';
import { SelectedDateProvider } from './SelectedDateProvider';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T01:00:00Z')); // 서울 10월 17일 10시
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openSheet(mode: 'snapshot' | 'api') {
  render(
    <SelectedDateProvider>
      <DateChips mode={mode} />
    </SelectedDateProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: '날짜 선택' }));
  return screen.getByRole('dialog', { name: '날짜 선택' });
}

describe('달력의 날씨 반영 점', () => {
  it('api 모드는 오늘부터 5일 뒤까지 6칸에 점을 찍는다', async () => {
    const sheet = await openSheet('api');
    const dotted = within(sheet)
      .getAllByTestId('weather-dot')
      .map((d) => d.closest('button')!.getAttribute('aria-label'));
    expect(dotted).toEqual([
      '10월 17일 (토)',
      '10월 18일 (일)',
      '10월 19일 (월)',
      '10월 20일 (화)',
      '10월 21일 (수)',
      '10월 22일 (목)',
    ]);
    expect(within(sheet).getByText('점 = 날씨 반영 기간 (오늘 ~ 10월 22일)')).toBeInTheDocument();
  });

  it('snapshot 모드는 점을 찍지 않는다', async () => {
    const sheet = await openSheet('snapshot');
    expect(within(sheet).queryAllByTestId('weather-dot')).toHaveLength(0);
    expect(within(sheet).queryByText(/점 =/)).toBeNull();
  });
});
