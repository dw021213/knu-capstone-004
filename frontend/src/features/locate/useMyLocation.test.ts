import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { CITY_HALL, insideJeju, useMyLocation } from './useMyLocation';

afterEach(() => vi.unstubAllGlobals());

function stubGeo(impl: Geolocation['getCurrentPosition']) {
  const getCurrentPosition = vi.fn(impl);
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}

describe('insideJeju', () => {
  it.each([
    [[126.5312, 33.4996], true],
    [[126.3, 33.96], true], // 추자도
    [[126.978, 37.5665], false], // 서울
    [[127.3, 33.4], false],
  ] as const)('%j → %s', (p, want) => expect(insideJeju([p[0], p[1]])).toBe(want));
});

describe('useMyLocation', () => {
  it('누르기 전에는 위치를 묻지 않는다', () => {
    const get = stubGeo(() => {});
    renderHook(() => useMyLocation(vi.fn()));
    expect(get).not.toHaveBeenCalled();
  });

  it('시간 초과 같은 실패는 제주시청으로 옮기고 찾지 못했다고 알린다', () => {
    stubGeo((_ok, fail) => fail!({ code: 3 } as GeolocationPositionError));
    const onMove = vi.fn();
    const { result } = renderHook(() => useMyLocation(onMove));
    act(() => result.current.locate());
    expect(result.current.state).toEqual({ status: 'unavailable' });
    expect(result.current.noticeOpen).toBe(true);
    expect(onMove).toHaveBeenCalledWith(CITY_HALL);
  });

  it('위치 기능이 없는 브라우저도 제주시청으로 옮긴다', () => {
    vi.stubGlobal('navigator', {});
    const onMove = vi.fn();
    const { result } = renderHook(() => useMyLocation(onMove));
    act(() => result.current.locate());
    expect(result.current.state).toEqual({ status: 'unavailable' });
    expect(onMove).toHaveBeenCalledWith(CITY_HALL);
  });

  it('안내를 닫아도 위치 상태는 남는다', () => {
    stubGeo((_ok, fail) => fail!({ code: 1 } as GeolocationPositionError));
    const { result } = renderHook(() => useMyLocation(vi.fn()));
    act(() => result.current.locate());
    act(() => result.current.dismiss());
    expect(result.current.noticeOpen).toBe(false);
    expect(result.current.state).toEqual({ status: 'denied' });
  });
});
