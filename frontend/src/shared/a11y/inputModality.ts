/**
 * 마지막 입력이 키보드였는지 기억한다. 스스로 포커스를 받는 시트·카드는 마우스·손가락으로 열었을 때
 * 굵은 포커스 테두리를 그리지 않는다(브라우저의 :focus-visible은 앞서 키보드를 썼으면 스크립트 포커스에도 테두리를 그린다)
 */
let keyboard = false;

const MODIFIERS = new Set(['Meta', 'Control', 'Alt', 'Shift']);

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (!MODIFIERS.has(e.key)) keyboard = true;
    },
    true,
  );
  window.addEventListener(
    'pointerdown',
    () => {
      keyboard = false;
    },
    true,
  );
}

export const usedKeyboard = () => keyboard;

/**
 * 포커스를 받는 요소에 붙인다. 그때 입력이 키보드가 아니면 data-focus-ring="off"를 적어
 * global.css가 :focus-visible 테두리를 끈다
 */
export const focusRingSource = {
  onFocus(e: { currentTarget: HTMLElement }) {
    e.currentTarget.dataset.focusRing = keyboard ? 'on' : 'off';
  },
};
