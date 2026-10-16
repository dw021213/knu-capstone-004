/// <reference path="../../src/types/global.d.ts" />
import { latLngToCell } from 'h3-js';
import { test, expect } from './fixtures';

const AIRPORT: [number, number] = [126.493, 33.5113];

async function openMap(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

async function project(page: import('@playwright/test').Page, lng: number, lat: number) {
  return page.evaluate(([a, b]) => window.__mapDebug!.project(a, b), [lng, lat] as const);
}

test('제주공항을 누르면 그 셀이 선택된다', async ({ page }) => {
  await openMap(page);
  const [x, y] = await project(page, ...AIRPORT);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).toHaveText(
    latLngToCell(AIRPORT[1], AIRPORT[0], 8),
  );
});

test('격자 밖 바다를 누르면 선택이 비워진다', async ({ page }) => {
  await openMap(page);
  const [x, y] = await project(page, ...AIRPORT);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).not.toHaveText('');
  const [sx, sy] = await project(page, 126.3, 33.7);
  await page.mouse.click(sx, sy);
  await expect(page.getByTestId('selected-cell')).toHaveText('');
});

test('첫 화면 셀 그리기가 1.5초 안에 끝난다', async ({ page }) => {
  await openMap(page);
  const t = await page.evaluate(() => performance.getEntriesByName('cells-drawn')[0]?.startTime);
  expect(t).toBeDefined();
  expect(t!).toBeLessThanOrEqual(1500);
});

const CENTER: [number, number] = [126.53, 33.38];
const zoomNow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__mapDebug!.zoom());

async function mouseDrag(page: import('@playwright/test').Page, dx: number, dy: number) {
  const vp = page.viewportSize()!;
  const x = vp.width / 2;
  const y = vp.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(x + (dx * i) / 20, y + (dy * i) / 20);
  await page.mouse.up();
}

test('지도 영역은 브라우저 기본 터치 동작을 막는다', async ({ page }) => {
  await openMap(page);
  await expect(page.getByTestId('map')).toHaveCSS('touch-action', 'none');
});

test('@desktop 휠로 확대하면 줌이 커진다', async ({ page }) => {
  await openMap(page);
  const z0 = await zoomNow(page);
  const [x, y] = await project(page, ...AIRPORT);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -500);
  await expect.poll(() => zoomNow(page)).toBeGreaterThan(z0 + 0.5);
  // 휠은 포인터 아래 지점을 고정한다
  const [x2, y2] = await project(page, ...AIRPORT);
  expect(Math.abs(x2 - x)).toBeLessThan(2);
  expect(Math.abs(y2 - y)).toBeLessThan(2);
});

test('@desktop 크게 끌어도 제주 경계 밖으로 나가지 않는다', async ({ page }) => {
  await openMap(page);
  const vp = page.viewportSize()!;
  // 오른쪽으로 크게: 서쪽 경계(125.9)가 화면 왼쪽 끝에 멈춘다
  await mouseDrag(page, 3000, 0);
  const [wx] = await project(page, 125.9, CENTER[1]);
  expect(Math.abs(wx)).toBeLessThan(2);
  let [cx, cy] = await project(page, ...CENTER);
  expect(cx).toBeGreaterThan(0);
  expect(cx).toBeLessThan(vp.width);
  expect(cy).toBeGreaterThan(0);
  expect(cy).toBeLessThan(vp.height);
  // 왼쪽 위로 크게: 동쪽(127.2)·남쪽(32.9) 경계가 화면 끝에 멈춘다
  await mouseDrag(page, -6000, -3000);
  const [ex, sy] = await project(page, 127.2, 32.9);
  expect(Math.abs(ex - vp.width)).toBeLessThan(2);
  expect(Math.abs(sy - vp.height)).toBeLessThan(2);
  [cx, cy] = await project(page, ...CENTER);
  expect(cx).toBeGreaterThan(0);
  expect(cx).toBeLessThan(vp.width);
  expect(cy).toBeGreaterThan(0);
  expect(cy).toBeLessThan(vp.height);
  // 끌기는 셀 선택이 아니다
  await expect(page.getByTestId('selected-cell')).toHaveText('');
});

test('핀치로 확대되고 한 손가락으로 끌면 이동한다', async ({ page }) => {
  await openMap(page);
  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize()!;
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const z0 = await zoomNow(page);

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: cx - 30, y: cy, id: 0 },
      { x: cx + 30, y: cy, id: 1 },
    ],
  });
  for (let i = 1; i <= 10; i++) {
    const d = 30 + i * 10;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: cx - d, y: cy, id: 0 },
        { x: cx + d, y: cy, id: 1 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => zoomNow(page)).toBeGreaterThan(z0 + 1);

  const before = await project(page, ...CENTER);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: cx, y: cy, id: 0 }],
  });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx - i * 8, y: cy - i * 5, id: 0 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await project(page, ...CENTER))[0]).toBeLessThan(before[0] - 60);
  const after = await project(page, ...CENTER);
  expect(after[1]).toBeLessThan(before[1] - 30);
  await expect(page.getByTestId('selected-cell')).toHaveText('');
});
