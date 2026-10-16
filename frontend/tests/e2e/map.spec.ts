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
