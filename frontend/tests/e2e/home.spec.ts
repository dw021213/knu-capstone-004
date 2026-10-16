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
  await expect(page.getByRole('button', { name: /코스/ })).toHaveCount(0);
});
