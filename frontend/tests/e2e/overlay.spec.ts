/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';

// 지도 위 범례·칩·안내·시트를 누르거나 굴려도 지도 확대·셀 선택이 일어나지 않아야 한다.
// 눌러도 비어 있는 바다면 새어도 모르므로, 셀로 덮이도록 한라산 쪽을 크게 확대한 뒤
// (1) 셀 하나를 골라 두고 (2) 오버레이를 눌러도 그 셀이 그대로인지 (3) 오버레이를 숨기면
// 같은 점이 다른 셀을 고르는지(밑에 셀이 있었다는 대조)를 본다.

const HALLA: [number, number] = [126.53, 33.36];
const selected = (page: Page) => page.getByTestId('selected-cell');
const zoomNow = (page: Page) => page.evaluate(() => window.__mapDebug!.zoom());

// 시트 안 날짜 칸을 이름으로 누르므로 날짜가 지나도 깨지지 않게 서울 2026-10-17(토) 10시로 고정한다
const FIXED_NOW = new Date('2026-10-17T10:00:00+09:00');

async function zoomIntoLand(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
  for (let i = 0; i < 3; i++) {
    const z = await zoomNow(page);
    const [x, y] = await page.evaluate(
      ([a, b]) => window.__mapDebug!.project(a, b),
      HALLA as [number, number],
    );
    await page.mouse.dblclick(x, y);
    await expect.poll(() => zoomNow(page)).toBeGreaterThan(z + 0.9);
  }
  // 확대 끝(셀 다시 그리기)까지 기다린다
  await page.waitForTimeout(400);
}

async function centerOf(l: Locator): Promise<[number, number]> {
  const b = (await l.boundingBox())!;
  return [b.x + b.width / 2, b.y + b.height / 2];
}

async function expectBlocks(page: Page, targets: Locator[]) {
  const vp = page.viewportSize()!;
  // (1) 화면 가운데 셀을 골라 둔다
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await expect(selected(page)).not.toHaveText('');
  const base = (await selected(page).textContent())!;
  const points: [number, number][] = [];
  for (const t of targets) points.push(await centerOf(t));

  // (2) 오버레이 위를 눌러도 선택이 그대로
  const z0 = await zoomNow(page);
  for (const [x, y] of points) {
    await page.mouse.click(x, y);
    await expect(selected(page)).toHaveText(base);
  }
  // 두 번 누르기·휠도 지도로 가지 않는다
  await page.mouse.dblclick(...points[0]);
  await page.mouse.move(...points[points.length - 1]);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  expect(await zoomNow(page)).toBe(z0);
  await expect(selected(page)).toHaveText(base);

  // (3) 대조: 오버레이를 숨기면 같은 점이 셀을 고른다
  await page.addStyleTag({ content: '[data-testid="map-overlay"] { display: none !important; }' });
  for (const [x, y] of points) {
    await page.mouse.click(x, y);
    await expect(selected(page)).not.toHaveText('');
    await expect(selected(page)).not.toHaveText(base);
  }
}

for (const tag of ['', '@desktop ']) {
  test(`${tag}범례·칩·안내·상단 라벨 위를 눌러도 지도 셀이 선택되지 않는다`, async ({ page }) => {
    await zoomIntoLand(page);
    const legend = page.getByTestId('legend');
    // 모바일은 펼친 범례 본문까지 확인한다(데스크톱은 처음부터 펼침)
    const toggle = legend.getByRole('button', { name: '위험도 범례' });
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    await expect(legend.getByText('매우 높음', { exact: true })).toBeVisible();
    const bar = page.getByTestId('date-bar');
    await expectBlocks(page, [
      legend.getByText('보통', { exact: true }),
      bar.getByRole('button', { name: '오늘' }),
      page.getByText('날씨 미반영 · 공간 점수는 날짜와 무관', { exact: true }),
      page.getByTestId('risk-tabs'),
    ]);
  });
}

test('달력 시트와 뒤 배경을 눌러도 지도 셀이 선택되지 않는다', async ({ page }) => {
  await zoomIntoLand(page);
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height / 2);
  const base = (await selected(page).textContent())!;
  expect(base).not.toBe('');

  await page.getByRole('button', { name: '날짜 선택' }).click();
  const sheet = page.getByRole('dialog', { name: '날짜 선택' });
  await expect(sheet).toBeVisible();
  // 시트 안 날짜 칸
  await sheet.getByRole('button', { name: '10월 31일 (토)', exact: true }).click();
  await expect(selected(page)).toHaveText(base);
  // 시트 밖 어두운 배경: 시트만 닫히고 셀은 그대로
  const box = (await sheet.boundingBox())!;
  await page.mouse.click(vp.width / 3, box.y / 2);
  await expect(sheet).toBeHidden();
  await expect(selected(page)).toHaveText(base);
});

for (const tag of ['', '@desktop ']) {
  test(`${tag}범례·날짜 칩이 배경 지도 출처를 가리지 않는다`, async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__mapReady === true);
    // 다른 요소가 가로채면 trial 누르기가 실패한다
    await page
      .getByRole('link', { name: '© OpenStreetMap contributors' })
      .click({ trial: true, timeout: 2000 });
  });
}

test('날짜 칩 영역의 빈 곳(안내 옆)은 지도로 통과한다', async ({ page }) => {
  await zoomIntoLand(page);
  const n = (await page
    .getByText('날씨 미반영 · 공간 점수는 날짜와 무관', { exact: true })
    .boundingBox())!;
  const vp = page.viewportSize()!;
  const x = n.x + n.width + 40;
  expect(x).toBeLessThan(vp.width - 20);
  // 확대하며 두 번 누른 곳의 셀이 골라져 있으므로 다른 셀로 바뀌는지 본다
  const base = (await selected(page).textContent()) ?? '';
  await page.mouse.click(x, n.y + n.height / 2);
  await expect(selected(page)).not.toHaveText('');
  await expect(selected(page)).not.toHaveText(base);
});
