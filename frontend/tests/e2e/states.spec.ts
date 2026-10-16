/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';
import type { Page, Route } from '@playwright/test';

// 날짜 칩·달력 이름이 날짜에 기대므로 서울 2026-10-17(토) 10시로 고정한다
const FIXED_NOW = new Date('2026-10-17T10:00:00+09:00');

/** scores.json 요청을 붙잡아 두었다가 release()를 부르면 그대로 보낸다 */
async function holdScores(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/data/scores.json', async (route: Route) => {
    await gate;
    await route.continue();
  });
  return release;
}

/** 요소 가운데를 실제로 누른다(aria-disabled 요소는 locator.click이 기다리기만 한다) */
async function tap(page: Page, l: import('@playwright/test').Locator) {
  const b = (await l.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
});

test.describe('U7-1 로딩', () => {
  test('위험도를 받는 동안 배경 지도는 먼저 보이고 안내가 뜨며 범례·날짜 칩은 반응하지 않는다', async ({
    page,
  }) => {
    const release = await holdScores(page);
    await page.goto('/');
    const status = page.getByRole('status').filter({ hasText: '위험도를 불러오는 중이에요' });
    await expect(status).toBeVisible();
    // 배경 타일은 점수를 기다리지 않고 그려진다
    await expect(page.getByTestId('map').locator('img').first()).toBeVisible();
    expect(await page.evaluate(() => window.__mapReady === true)).toBe(false);

    const legendToggle = page.getByRole('button', { name: '위험도 범례' });
    await expect(legendToggle).toHaveAttribute('aria-disabled', 'true');
    await tap(page, legendToggle);
    await expect(legendToggle).toHaveAttribute('aria-expanded', 'false');

    const bar = page.getByTestId('date-bar');
    const today = bar.getByRole('button', { name: '오늘' });
    const pick = bar.getByRole('button', { name: '날짜 선택' });
    await expect(today).toHaveAttribute('aria-disabled', 'true');
    await expect(pick).toHaveAttribute('aria-disabled', 'true');
    await tap(page, pick);
    await expect(page.getByRole('dialog', { name: '날짜 선택' })).toHaveCount(0);

    // 점수가 없는 동안 육지를 눌러도 '위험도 정보 없음' 시트를 열지 않는다
    const [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.53, 33.36));
    await page.mouse.click(x, y);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('cell-sheet')).toHaveCount(0);

    release();
    await page.waitForFunction(() => window.__mapReady === true);
    await expect(status).toHaveCount(0);
    await expect(legendToggle).not.toHaveAttribute('aria-disabled', 'true');
    await expect(pick).not.toHaveAttribute('aria-disabled', 'true');
    // 대조: 같은 자리를 누르면 이제 반응한다
    await tap(page, legendToggle);
    await expect(legendToggle).toHaveAttribute('aria-expanded', 'true');
    await tap(page, legendToggle);
    await tap(page, pick);
    await expect(page.getByRole('dialog', { name: '날짜 선택' })).toBeVisible();
  });
});
