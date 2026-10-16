/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';

const NAMES_5_TO_1 = ['매우 높음', '높음', '보통', '낮음', '매우 낮음'];
const NO_DATA = '데이터 부족(도로 자료 미확인)';
const BASIS = '교통사고 도로 모델 · 날짜와 무관한 공간 점수';

async function openMap(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

test('모바일 범례는 처음에 접혀 색 막대 1~5만 보인다', async ({ page }) => {
  await openMap(page);
  const legend = page.getByTestId('legend');
  const toggle = legend.getByRole('button', { name: '위험도 범례' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  for (const n of ['1', '2', '3', '4', '5']) {
    await expect(toggle.getByText(n, { exact: true })).toBeVisible();
  }
  for (const name of NAMES_5_TO_1) {
    await expect(legend.getByText(name, { exact: true })).toBeHidden();
  }
  await expect(legend.getByText(NO_DATA)).toBeHidden();
  await expect(legend.getByText(BASIS)).toBeHidden();
  // 지도 오른쪽 위, 상단 '종합' 영역 아래
  const vp = page.viewportSize()!;
  const box = (await legend.boundingBox())!;
  const top = (await page.getByTestId('risk-tabs').boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(vp.width - 24);
  expect(box.y).toBeGreaterThanOrEqual(top.y + top.height);
  expect(box.y).toBeLessThan(140);
  // 누르기 대상은 44px 이상
  const t = (await toggle.boundingBox())!;
  expect(t.height).toBeGreaterThanOrEqual(44);
  expect(t.width).toBeGreaterThanOrEqual(44);
});

test('범례를 누르면 5→1 등급 이름, 데이터 부족 빗금, 기준 문구가 펼쳐지고 다시 누르면 접힌다', async ({
  page,
}) => {
  await openMap(page);
  const legend = page.getByTestId('legend');
  const toggle = legend.getByRole('button', { name: '위험도 범례' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const rows = legend.getByTestId('legend-level');
  await expect(rows).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await expect(rows.nth(i)).toHaveText(`${5 - i}${NAMES_5_TO_1[i]}`);
    await expect(rows.nth(i).getByText(NAMES_5_TO_1[i], { exact: true })).toBeVisible();
  }
  await expect(legend.getByText(NO_DATA)).toBeVisible();
  const swatch = legend.getByTestId('legend-no-data-swatch');
  await expect(swatch).toHaveCSS('background-image', /repeating-linear-gradient/);
  await expect(legend.getByText(BASIS)).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(legend.getByText('매우 높음', { exact: true })).toBeHidden();
});

test('범례는 키보드로 펴고 접는다', async ({ page }) => {
  await openMap(page);
  const legend = page.getByTestId('legend');
  const toggle = legend.getByRole('button', { name: '위험도 범례' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(legend.getByText('매우 높음', { exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('@desktop 데스크톱 범례는 처음부터 펼친 우하단 카드다', async ({ page }) => {
  await openMap(page);
  const legend = page.getByTestId('legend');
  const toggle = legend.getByRole('button', { name: '위험도 범례' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  for (const name of NAMES_5_TO_1) {
    await expect(legend.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(legend.getByText(NO_DATA)).toBeVisible();
  await expect(legend.getByText(BASIS)).toBeVisible();
  const vp = page.viewportSize()!;
  const box = (await legend.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(vp.width - 40);
  expect(box.y + box.height).toBeGreaterThan(vp.height - 80);
  // 배경 지도 출처를 가리지 않는다
  const credit = page.getByRole('link', { name: '© OpenStreetMap contributors' });
  await credit.click({ trial: true });
});
