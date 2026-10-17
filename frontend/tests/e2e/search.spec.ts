/// <reference path="../../src/types/global.d.ts" />
import type { EmdFile } from '../../src/entities/place/emd';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function openMap(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

const box = (page: Page) => page.getByRole('combobox', { name: '읍면동 검색' });
const list = (page: Page) => page.getByRole('listbox', { name: '읍면동 검색 결과' });
const zoomNow = (page: Page) => page.evaluate(() => window.__mapDebug!.zoom());

for (const tag of ['', '@desktop ']) {
  test(`${tag}읍면동 이름을 입력하고 키보드로 고르면 그곳으로 확대해 옮기고 셀 시트를 연다`, async ({
    page,
  }) => {
    const emd = (await (await page.request.get('/data/emd.json')).json()) as EmdFile;
    const aewol = emd.items.find((i) => i.name === '애월읍')!;
    await openMap(page);
    const z0 = await zoomNow(page);

    const input = box(page);
    await expect(input).toBeVisible();
    const b = (await input.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    // 상단: 검색창이 '종합' 탭보다 위
    const tabs = (await page.getByTestId('risk-tabs').boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(tabs.y + 1);

    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await input.fill('애월');
    await expect(list(page)).toBeVisible();
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    const options = list(page).getByRole('option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveText('애월읍제주시');

    await page.keyboard.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    const active = await input.getAttribute('aria-activedescendant');
    expect(active).toBe(await options.first().getAttribute('id'));
    await page.keyboard.press('Enter');

    await expect(list(page)).toHaveCount(0);
    await expect(input).toHaveValue('제주시 애월읍');
    // 확대하고 애월읍 대표점이 화면 안(지도 위쪽 절반쯤)으로 온다
    await expect.poll(() => zoomNow(page)).toBeGreaterThanOrEqual(12);
    expect(await zoomNow(page)).toBeGreaterThan(z0);
    await page.waitForTimeout(400);
    const vp = page.viewportSize()!;
    const [x, y] = await page.evaluate(
      ([a, c]) => window.__mapDebug!.project(a, c),
      aewol.center as [number, number],
    );
    expect(Math.abs(x - vp.width / 2)).toBeLessThan(vp.width / 4);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(vp.height / 2 + 40);

    // 그 점의 셀 시트가 열린다
    const sheet = page.getByTestId('cell-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('제주시 애월읍');
    await expect(page.getByTestId('selected-cell')).not.toHaveText('');
    // 시트를 Esc로 닫으면 포커스가 검색창으로 돌아온다
    await expect(sheet).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(input).toBeFocused();
  });
}

test('목록은 최대 8개이고, 위아래 화살표로 움직이며, Esc로 닫힌다', async ({ page }) => {
  await openMap(page);
  const input = box(page);
  await input.fill('동');
  const options = list(page).getByRole('option');
  await expect(options).toHaveCount(8);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'false');
  // 처음에서 위로 가면 끝으로
  await page.keyboard.press('ArrowUp');
  await expect(options.nth(7)).toHaveAttribute('aria-selected', 'true');
  for (let i = 0; i < 8; i++) {
    const h = (await options.nth(i).boundingBox())!.height;
    expect(h).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Escape');
  await expect(list(page)).toHaveCount(0);
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue('동');
  await expect(input).toBeFocused();
});

test('마우스로 목록을 눌러 고를 수 있다', async ({ page }) => {
  await openMap(page);
  await box(page).fill('우도');
  await list(page)
    .getByRole('option', { name: /우도면/ })
    .click();
  await expect(box(page)).toHaveValue('제주시 우도면');
  await expect(page.getByTestId('cell-sheet').getByRole('heading', { level: 2 })).toHaveText(
    '제주시 우도면',
  );
});

test('일치하는 읍면동이 없으면 목록 대신 안내를 보인다', async ({ page }) => {
  await openMap(page);
  await box(page).fill('서울');
  await expect(page.getByRole('status').filter({ hasText: '서울' })).toHaveText(
    "'서울'과 일치하는 읍면동이 없어요",
  );
  await expect(list(page)).toHaveCount(0);
  await expect(box(page)).toHaveAttribute('aria-expanded', 'false');
  // 지우면 안내도 사라진다
  await box(page).fill('');
  await expect(page.getByText("'서울'과 일치하는 읍면동이 없어요")).toHaveCount(0);
});

for (const tag of ['', '@desktop ']) {
  test(`${tag}일치 없음 안내는 '종합' 탭 라벨을 덮지 않는다`, async ({ page }) => {
    await openMap(page);
    await box(page).fill('서울');
    const msg = page.getByText("'서울'과 일치하는 읍면동이 없어요");
    await expect(msg).toBeVisible();
    const m = (await msg.boundingBox())!;
    const tab = page.getByTestId('risk-tabs').getByText('종합');
    await expect(tab).toBeVisible();
    const t = (await tab.boundingBox())!;
    const overlap =
      m.x < t.x + t.width && t.x < m.x + m.width && m.y < t.y + t.height && t.y < m.y + m.height;
    expect(overlap).toBe(false);
    // 라벨 가운데에 실제로 보이는 것은 라벨 자신이다
    const top = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.textContent ?? '',
      [t.x + t.width / 2, t.y + t.height / 2] as const,
    );
    expect(top).toBe('종합');
  });
}
