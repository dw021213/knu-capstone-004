import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, keepDraft, readDraft } from './draft';
import type { Stop } from './store';

const stop = (i: number): Stop => ({
  id: `s${i}`,
  name: `장소 ${i}`,
  lat: 33.4 + i * 0.01,
  lng: 126.5,
  source: 'map',
});
const EMPTY = { name: '', stops: [] };

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('만들던 코스 초안', () => {
  it('새 코스와 고치는 코스마다 따로 두고, 기준과 같아지면 지운다', () => {
    const draft = { name: '만들던 코스', stops: [stop(1)] };
    keepDraft(undefined, draft, EMPTY);
    expect(readDraft(undefined)).toEqual(draft);
    expect(readDraft('fix')).toBeNull();
    keepDraft(undefined, EMPTY, EMPTY);
    expect(readDraft(undefined)).toBeNull();
    keepDraft('fix', draft, EMPTY);
    clearDraft('fix');
    expect(readDraft('fix')).toBeNull();
  });

  it('모양이 다르면 버린다', () => {
    sessionStorage.setItem('jeju-safety.my-course-draft.v1:new', '{broken');
    expect(readDraft(undefined)).toBeNull();
    sessionStorage.setItem(
      'jeju-safety.my-course-draft.v1:new',
      JSON.stringify({ name: 'x', stops: [{ ...stop(1), lat: 'x' }] }),
    );
    expect(readDraft(undefined)).toBeNull();
  });

  it('sessionStorage에 접근할 수 없어도 던지지 않는다', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(readDraft(undefined)).toBeNull();
    expect(() => keepDraft(undefined, { name: 'x', stops: [stop(1)] }, EMPTY)).not.toThrow();
    expect(() => clearDraft(undefined)).not.toThrow();
  });
});
