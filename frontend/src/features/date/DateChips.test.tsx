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

// 백엔드 기상은 AWS 관측 기반이라 미래 날짜의 날씨를 반영하지 않는다. 그래서 두 모드 모두 점을 찍지 않는다.
describe('달력의 날씨 점', () => {
  it.each(['api', 'snapshot'] as const)('%s 모드는 점을 찍지 않는다', async (mode) => {
    const sheet = await openSheet(mode);
    expect(within(sheet).queryAllByTestId('weather-dot')).toHaveLength(0);
    expect(within(sheet).queryByText(/점 =/)).toBeNull();
  });
});
