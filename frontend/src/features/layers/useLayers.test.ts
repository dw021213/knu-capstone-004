import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { LAYERS_KEY, useLayers } from './useLayers';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('useLayers', () => {
  it('처음엔 모두 꺼져 있다', () => {
    const { result } = renderHook(() => useLayers());
    expect([...result.current.on]).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it('toggle로 켜고 끈다', () => {
    const { result } = renderHook(() => useLayers());
    act(() => result.current.toggle('cctv'));
    act(() => result.current.toggle('fire'));
    expect(result.current.on.has('cctv')).toBe(true);
    expect(result.current.on.has('fire')).toBe(true);
    expect(result.current.count).toBe(2);
    act(() => result.current.toggle('cctv'));
    expect(result.current.on.has('cctv')).toBe(false);
    expect(result.current.count).toBe(1);
  });

  it('off는 켜져 있으면 끄고, 꺼져 있으면 그대로 둔다', () => {
    const { result } = renderHook(() => useLayers());
    act(() => result.current.toggle('police'));
    act(() => result.current.off('police'));
    act(() => result.current.off('police'));
    expect(result.current.on.has('police')).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('켠 레이어를 저장하고 다음에 복원한다', () => {
    const first = renderHook(() => useLayers());
    act(() => first.result.current.toggle('convenience'));
    act(() => first.result.current.toggle('police'));
    first.unmount();
    expect(JSON.parse(window.localStorage.getItem(LAYERS_KEY)!)).toEqual(['convenience', 'police']);
    const { result } = renderHook(() => useLayers());
    expect([...result.current.on].sort()).toEqual(['convenience', 'police']);
  });

  it('저장값이 깨졌거나 모르는 종류가 섞이면 아는 종류만 쓴다', () => {
    window.localStorage.setItem(LAYERS_KEY, '{oops');
    expect(renderHook(() => useLayers()).result.current.count).toBe(0);
    window.localStorage.setItem(LAYERS_KEY, JSON.stringify(['cctv', 'er', 7, 'lodging', 'cctv']));
    const { result } = renderHook(() => useLayers());
    expect([...result.current.on].sort()).toEqual(['cctv', 'lodging']);
    window.localStorage.setItem(LAYERS_KEY, JSON.stringify({ cctv: true }));
    expect(renderHook(() => useLayers()).result.current.count).toBe(0);
  });

  it('저장소를 읽거나 쓸 수 없어도(throw) 켜고 끌 수 있다', () => {
    const proto = Object.getPrototypeOf(window.localStorage) as Storage;
    vi.spyOn(proto, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(proto, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useLayers());
    expect(result.current.count).toBe(0);
    act(() => result.current.toggle('lodging'));
    expect(result.current.on.has('lodging')).toBe(true);
  });

  it('window.localStorage 접근 자체가 throw해도 동작한다', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => useLayers());
    act(() => result.current.toggle('fire'));
    expect(result.current.count).toBe(1);
  });
});
