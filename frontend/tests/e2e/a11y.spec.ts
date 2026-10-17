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
