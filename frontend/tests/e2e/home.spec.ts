/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';

async function openMap(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

for (const tag of ['', '@desktop ']) {
  test(`${tag}상단에 선택된 '종합' 라벨이 있고 지도는 화면 전체를 쓴다`, async ({ page }) => {
    await openMap(page);
    const vp = page.viewportSize()!;
    const label = page.getByTestId('risk-tabs').getByText('종합', { exact: true });
    await expect(label).toBeVisible();
    await expect(label).toHaveAttribute('aria-current', 'true');
    const box = (await label.boundingBox())!;
    expect(box.y).toBeLessThan(80);
    // 상단 영역은 지도 위에 얹는다: 지도 크기는 뷰포트 그대로
    const map = (await page.getByTestId('map').boundingBox())!;
    expect(map).toEqual({ x: 0, y: 0, width: vp.width, height: vp.height });
  });
}

test('동작하지 않는 자리 채우기 컨트롤은 두지 않는다', async ({ page }) => {
  await openMap(page);
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test("'오늘 안전한 코스'는 날짜 칩 바로 위에 있고 누르면 코스 목록으로 간다", async ({ page }) => {
  await openMap(page);
  const link = page.getByRole('link', { name: '오늘 안전한 코스' });
  await expect(link).toHaveCount(1);
  await expect(link).toBeVisible();
  const box = (await link.boundingBox())!;
  const bar = (await page.getByTestId('date-bar').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
  expect(bar.y - (box.y + box.height)).toBeLessThan(80);
  await link.click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByRole('heading', { level: 1, name: '오늘 안전한 코스' })).toBeVisible();
});

test("@desktop '오늘 안전한 코스'는 좌상단 레이어 버튼 옆에 있다", async ({ page }) => {
  await openMap(page);
  const link = page.getByRole('link', { name: '오늘 안전한 코스' });
  await expect(link).toHaveCount(1);
  const box = (await link.boundingBox())!;
  const layer = (await page.getByRole('button', { name: /^레이어/ }).boundingBox())!;
  expect(Math.abs(box.y - layer.y)).toBeLessThan(2);
  expect(box.x).toBeGreaterThan(layer.x + layer.width);
  expect(box.x - (layer.x + layer.width)).toBeLessThan(24);
  await link.click();
  await expect(page).toHaveURL(/\/courses$/);
});
