/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const ROWS = [
  { name: 'CCTV', desc: '방범·교통 카메라', source: '행정안전부, 2020년 기준 일부' },
  { name: '편의점', desc: '밤늦게 도움 요청', source: '소상공인시장진흥공단, 2026년 6월' },
  { name: '숙박', desc: '호텔·모텔', source: '소상공인시장진흥공단, 2026년 6월' },
  { name: '경찰', desc: '지구대·파출소', source: '경찰청, 2025년 12월 기준' },
  { name: '119안전센터', desc: '화재·구급 출동', source: '소방청' },
];

async function openMap(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

const layerButton = (page: Page) => page.getByRole('button', { name: /^레이어/ });
const panel = (page: Page) => page.getByRole('region', { name: '시설 레이어' });
const sw = (page: Page, name: string) => panel(page).getByRole('switch', { name });

for (const tag of ['', '@desktop ']) {
  test(`${tag}레이어 버튼은 지도 좌상단에 있고 누르면 5개 토글이 모두 꺼진 채 열린다`, async ({
    page,
  }) => {
    await openMap(page);
    const btn = layerButton(page);
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(panel(page)).toBeHidden();
    // 좌상단, 상단 '종합' 영역 아래
    const box = (await btn.boundingBox())!;
    const top = (await page.getByTestId('risk-tabs').boundingBox())!;
    expect(box.x).toBeLessThan(24);
    expect(box.y).toBeGreaterThanOrEqual(top.y + top.height);
    expect(box.y).toBeLessThan(140);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    // 켠 것이 없으면 배지가 없다
    await expect(page.getByTestId('layer-badge')).toHaveCount(0);

    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const controls = await btn.getAttribute('aria-controls');
    await expect(page.locator(`#${controls}`)).toBeVisible();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('switch')).toHaveCount(5);
    for (const row of ROWS) {
      const s = sw(page, row.name);
      await expect(s).toHaveAttribute('aria-checked', 'false');
      await expect(s).toBeEnabled();
      await expect(s).toContainText(row.desc);
      await expect(s).toContainText(row.source);
      const b = (await s.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    // 다시 누르면 닫힌다
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(panel(page)).toBeHidden();
  });
}

test('토글을 켜면 검정으로 채워지고 버튼에 켠 개수 배지가 붙는다', async ({ page }) => {
  await openMap(page);
  await layerButton(page).click();
  await sw(page, 'CCTV').click();
  await expect(sw(page, 'CCTV')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('layer-badge')).toHaveText('1');
  await sw(page, '119안전센터').click();
  await expect(page.getByTestId('layer-badge')).toHaveText('2');
  await expect(layerButton(page)).toHaveAccessibleName('레이어 2개 켜짐');
  // 켜진 토글은 검정 채움(ink), 꺼진 토글은 흰 바탕
  const ink = 'rgb(17, 17, 17)';
  await expect(sw(page, 'CCTV').getByTestId('switch-track')).toHaveCSS('background-color', ink);
  await expect(sw(page, '편의점').getByTestId('switch-track')).not.toHaveCSS(
    'background-color',
    ink,
  );
  await sw(page, 'CCTV').click();
  await expect(sw(page, 'CCTV')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('layer-badge')).toHaveText('1');
});

test('키보드로 열고, 토글하고, Esc로 닫으면 포커스가 버튼으로 돌아온다', async ({ page }) => {
  await openMap(page);
  await layerButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(sw(page, 'CCTV')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(sw(page, 'CCTV')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab');
  await expect(sw(page, '편의점')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(layerButton(page)).toBeFocused();
  await expect(page.getByTestId('layer-badge')).toHaveText('1');
});

test('켜기 전에는 시설 파일을 받지 않고, 켠 종류만 처음 켤 때 받는다', async ({ page }) => {
  const poi: string[] = [];
  page.on('request', (r) => {
    const m = /\/data\/poi\/([a-z]+)\.json/.exec(r.url());
    if (m) poi.push(m[1]);
  });
  await openMap(page);
  await layerButton(page).click();
  await expect(panel(page)).toBeVisible();
  await page.waitForTimeout(300);
  expect(poi).toEqual([]);
  const res = page.waitForResponse('**/data/poi/fire.json');
  await sw(page, '119안전센터').click();
  await res;
  // 껐다 다시 켜도 다시 받지 않는다
  await sw(page, '119안전센터').click();
  await sw(page, '119안전센터').click();
  await page.waitForTimeout(300);
  expect(poi).toEqual(['fire']);
});

test("자료가 'pending'인 종류는 켜면 '준비 중'으로 비활성되고 배지에 세지 않는다", async ({
  page,
}) => {
  await page.route('**/data/poi/police.json', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'police',
        status: 'pending',
        source: '로그인이 필요해 내려받지 못함',
        items: [],
      }),
    }),
  );
  await openMap(page);
  await layerButton(page).click();
  await sw(page, '경찰').click();
  await expect(sw(page, '경찰')).toBeDisabled();
  await expect(sw(page, '경찰')).toHaveAttribute('aria-checked', 'false');
  await expect(sw(page, '경찰')).toContainText('준비 중');
  await expect(page.getByTestId('layer-badge')).toHaveCount(0);
  // 다른 종류는 그대로 켤 수 있다
  await sw(page, 'CCTV').click();
  await expect(page.getByTestId('layer-badge')).toHaveText('1');
});
