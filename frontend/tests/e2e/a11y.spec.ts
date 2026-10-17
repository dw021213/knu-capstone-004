/// <reference path="../../src/types/global.d.ts" />
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }));
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T10:00:00+09:00'));
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
});

for (const tag of ['', '@desktop ']) {
  test(`${tag}지도 홈에 접근성 critical·serious 위반이 없다`, async ({ page }) => {
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test('범례를 펼친 화면에 접근성 critical·serious 위반이 없다', async ({ page }) => {
  await page.getByRole('button', { name: '위험도 범례' }).click();
  await expect(page.getByText('매우 높음', { exact: true })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test('달력 시트에 접근성 critical·serious 위반이 없다', async ({ page }) => {
  await page.getByRole('button', { name: '날짜 선택' }).click();
  await expect(page.getByRole('dialog', { name: '날짜 선택' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

for (const tag of ['', '@desktop ']) {
  test(`${tag}레이어 패널을 연 화면에 접근성 critical·serious 위반이 없다`, async ({ page }) => {
    await page.getByRole('button', { name: /^레이어/ }).click();
    const panel = page.getByRole('region', { name: '시설 레이어' });
    await expect(panel).toBeVisible();
    await panel.getByRole('switch', { name: 'CCTV' }).click();
    await expect(page.getByTestId('layer-badge')).toHaveText('1');
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test('시설 카드를 연 화면에 접근성 critical·serious 위반이 없다', async ({ page }) => {
  await page.getByRole('button', { name: /^레이어/ }).click();
  await page.getByRole('switch', { name: '119안전센터' }).click();
  await page.getByRole('button', { name: /^레이어/ }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.__mapDebug!.markers())).length)
    .toBeGreaterThan(0);
  const m = (await page.evaluate(() => window.__mapDebug!.markers())).find(
    (i) => i.kind === 'marker',
  )!;
  await page.mouse.click(m.x, m.y);
  await expect(page.getByTestId('poi-card')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
