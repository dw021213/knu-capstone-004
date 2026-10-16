/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';
test('첫 화면에 서비스 이름이 있다', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('제주 안전지도');
  await expect(page.getByRole('heading', { name: '제주 안전지도' })).toBeAttached();
});
