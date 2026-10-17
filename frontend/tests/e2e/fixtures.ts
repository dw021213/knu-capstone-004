/// <reference path="../../src/types/global.d.ts" />
import { test as base, expect, type Page } from '@playwright/test';
import { TAP_DELAY } from '../../src/features/map/gesture';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/tile.openstreetmap.org/**', (r) =>
      r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
    );
    await use(page);
  },
});
export { expect };

/**
 * 누른 뒤 셀 선택이 바뀌지 않았는지 본다. 지도는 한 번 누르기를 TAP_DELAY만큼 기다렸다가 고르므로,
 * 바로 확인하면 새어 나간 선택을 놓친다. 그 시간이 지난 뒤 확인한다
 */
export async function expectSelectionStays(page: Page, value: string) {
  await page.waitForTimeout(TAP_DELAY + 150);
  await expect(page.getByTestId('selected-cell')).toHaveText(value);
}
