/// <reference path="../../src/types/global.d.ts" />
import { test as base, expect } from '@playwright/test';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*.basemaps.cartocdn.com/**', (r) =>
      r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
    );
    await use(page);
  },
});
export { expect };
