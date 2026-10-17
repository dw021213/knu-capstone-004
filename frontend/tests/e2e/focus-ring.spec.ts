/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';

// 마우스·손가락으로 연 시트·패널에는 굵은 포커스 테두리를 그리지 않고, 키보드로 열었을 때만 그린다

async function openMap(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

const outline = (l: Locator) =>
  l.evaluate((el) => {
    const s = getComputedStyle(el);
    return s.outlineStyle === 'none' ? 0 : parseFloat(s.outlineWidth);
  });

for (const tag of ['', '@desktop ']) {
  test(`${tag}검색창에 글자를 넣은 뒤 지도를 눌러 연 셀 시트에는 포커스 테두리가 없다`, async ({
    page,
  }) => {
    await openMap(page);
    // 검색창에 포커스가 있던 상태(키보드 입력 뒤)에서 마우스로 셀을 누른다
    const box = page.getByRole('combobox', { name: '읍면동 검색' });
    await box.click();
    await box.fill('없는곳');
    await page.keyboard.press('Escape');
    const [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.5312, 33.4996));
    await page.mouse.click(x, y);
    const sheet = page.getByTestId('cell-sheet');
    await expect(sheet).toBeFocused();
    expect(await outline(sheet)).toBe(0);
  });

  test(`${tag}Tab으로 레이어 버튼에 간 뒤 지도를 눌러 연 셀 시트에는 포커스 테두리가 없다`, async ({
    page,
  }) => {
    await openMap(page);
    await page.getByRole('button', { name: /^레이어/ }).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.5312, 33.4996));
    await page.mouse.click(x, y);
    const sheet = page.getByTestId('cell-sheet');
    await expect(sheet).toBeFocused();
    expect(await outline(sheet)).toBe(0);
  });

  test(`${tag}키보드로 검색해 연 셀 시트에는 포커스 테두리가 보인다`, async ({ page }) => {
    await openMap(page);
    const box = page.getByRole('combobox', { name: '읍면동 검색' });
    await box.fill('애월');
    await expect(page.getByRole('listbox', { name: '읍면동 검색 결과' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const sheet = page.getByTestId('cell-sheet');
    await expect(sheet).toBeFocused();
    expect(await outline(sheet)).toBeGreaterThanOrEqual(2);
  });
}
