import { describe, expect, it } from 'vitest';
import { focusRingSource, usedKeyboard } from './inputModality';

describe('inputModality', () => {
  it('마지막 입력이 키보드면 참, 포인터면 거짓', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(usedKeyboard()).toBe(true);
    window.dispatchEvent(new Event('pointerdown'));
    expect(usedKeyboard()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(usedKeyboard()).toBe(true);
  });

  it('보조키만 누른 것(단축키 준비)은 키보드 조작으로 보지 않는다', () => {
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }));
    expect(usedKeyboard()).toBe(false);
  });

  it('포커스를 받을 때 키보드였는지를 data-focus-ring에 적는다', () => {
    const el = document.createElement('section');
    window.dispatchEvent(new Event('pointerdown'));
    focusRingSource.onFocus({ currentTarget: el });
    expect(el.dataset.focusRing).toBe('off');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    focusRingSource.onFocus({ currentTarget: el });
    expect(el.dataset.focusRing).toBe('on');
  });
});
