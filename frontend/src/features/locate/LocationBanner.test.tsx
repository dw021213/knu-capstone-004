import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationBanner } from './LocationBanner';
import type { LocateState } from './useMyLocation';

afterEach(cleanup);

describe('LocationBanner', () => {
  it.each([
    [{ status: 'denied' }, '위치 권한을 켜면 내 주변 위험도를 볼 수 있어요', '제주시청'],
    [{ status: 'unavailable' }, '내 위치를 찾지 못했어요', '제주시청'],
    [{ status: 'outside' }, '제주 밖에 있어요', '그대로'],
  ] as [LocateState, string, string][])('%j: 문구와 닫기 버튼', async (state, title, sub) => {
    const onClose = vi.fn();
    render(<LocationBanner state={state} onClose={onClose} />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(title);
    expect(banner).toHaveTextContent(sub);
    await userEvent.click(screen.getByRole('button', { name: '위치 안내 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('내 위치로 옮겼으면 띠 없이 화면 읽기 프로그램에만 알린다', () => {
    render(<LocationBanner state={{ status: 'me', lngLat: [126.56, 33.25] }} onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('내 위치로 옮겼어요');
    expect(screen.queryByTestId('location-banner')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('찾는 중에는 아무것도 띄우지 않는다', () => {
    const { container } = render(
      <LocationBanner state={{ status: 'locating' }} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
