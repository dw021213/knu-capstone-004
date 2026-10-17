/// <reference path="../../src/types/global.d.ts" />
import { cellToLatLng, latLngToCell } from 'h3-js';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// 셀을 고르면 지도가 셀 중심을 시트(모바일)·패널(데스크톱)에 가리지 않는 곳으로 옮긴다

async function openMap(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

const zoomNow = (page: Page) => page.evaluate(() => window.__mapDebug!.zoom());
const project = (page: Page, [lng, lat]: [number, number]) =>
  page.evaluate(([a, b]) => window.__mapDebug!.project(a, b), [lng, lat] as const);

/** [경도, 위도]가 든 셀과 그 중심 [경도, 위도] */
function cellOf(lng: number, lat: number) {
  const h3 = latLngToCell(lat, lng, 8);
  const [clat, clng] = cellToLatLng(h3);
  return { h3, center: [clng, clat] as [number, number] };
}

/** 셀 시트·패널에 가리지 않고 머리글 아래에 보이는 지도 영역 */
async function visibleArea(page: Page) {
  const vp = page.viewportSize()!;
  const header = (await page.getByRole('banner').boundingBox())!;
  const sheet = (await page.getByTestId('cell-sheet').boundingBox())!;
  const wide = vp.width > 768;
  return {
    left: 0,
    top: header.y + header.height,
    right: wide ? sheet.x : vp.width,
    bottom: wide ? vp.height : sheet.y,
  };
}

async function expectInside(page: Page, center: [number, number]) {
  const inside = async () => {
    const a = await visibleArea(page);
    const [x, y] = await project(page, center);
    return x > a.left && x < a.right && y > a.top && y < a.bottom;
  };
  await expect.poll(inside, { timeout: 5000 }).toBe(true);
  // 시트 내용(주변 시설 등)이 다 들어온 뒤에도 그대로 보인다
  await page.waitForTimeout(600);
  expect(await inside()).toBe(true);
}

test('모바일: 화면 아래쪽 셀을 고르면 지도를 옮겨 셀 중심이 시트 위 보이는 지도 영역에 오고 확대 수준은 그대로다', async ({
  page,
}) => {
  await openMap(page);
  const { h3, center } = cellOf(126.56, 33.25);
  const vp = page.viewportSize()!;
  const [x, y] = await project(page, center);
  // 전제: 열린 시트(화면 아래쪽)에 가릴 자리
  expect(y).toBeGreaterThan(vp.height * 0.55);
  const z0 = await zoomNow(page);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).toHaveText(h3);
  await expectInside(page, center);
  expect(await zoomNow(page)).toBeCloseTo(z0, 6);
});

test('모바일: 이미 보이는 셀을 고르면 지도를 옮기지 않는다', async ({ page }) => {
  await openMap(page);
  const { h3, center } = cellOf(126.53, 33.5);
  const [x, y] = await project(page, center);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).toHaveText(h3);
  await page.waitForTimeout(800);
  const [x1, y1] = await project(page, center);
  expect(Math.abs(x1 - x)).toBeLessThan(0.5);
  expect(Math.abs(y1 - y)).toBeLessThan(0.5);
});

test('@desktop 오른쪽 셀을 고르면 지도를 옮겨 셀 중심이 패널 왼쪽 지도 영역에 오고 확대 수준은 그대로다', async ({
  page,
}) => {
  await openMap(page);
  const { h3, center } = cellOf(126.93, 33.46);
  const vp = page.viewportSize()!;
  const [x, y] = await project(page, center);
  // 전제: 열린 패널(오른쪽 400px)에 가릴 자리
  expect(x).toBeGreaterThan(vp.width - 400);
  const z0 = await zoomNow(page);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).toHaveText(h3);
  await expectInside(page, center);
  expect(await zoomNow(page)).toBeCloseTo(z0, 6);
});

test('모바일: 검색으로 고른 곳의 셀 시트를 열어도 그 셀 중심이 시트 위 보이는 지도 영역에 있다', async ({
  page,
}) => {
  await openMap(page);
  const input = page.getByRole('combobox', { name: '읍면동 검색' });
  await input.fill('대정');
  await page.getByRole('listbox', { name: '읍면동 검색 결과' }).getByRole('option').first().click();
  await expect(page.getByTestId('selected-cell')).not.toHaveText('');
  const cell = (await page.getByTestId('selected-cell').textContent())!;
  const [clat, clng] = cellToLatLng(cell);
  await expectInside(page, [clng, clat]);
});
