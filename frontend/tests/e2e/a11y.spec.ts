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

test.describe('지도를 그린 뒤', () => {
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

  for (const tag of ['', '@desktop ']) {
    test(`${tag}레이어 패널을 연 화면에 접근성 critical·serious 위반이 없다`, async ({ page }) => {
      await page.getByRole('button', { name: /^레이어/ }).click();
      const panel = page.getByRole('region', { name: '시설 레이어' });
      await expect(panel).toBeVisible();
      await panel.getByRole('switch', { name: 'CCTV' }).click();
      await expect(page.getByTestId('layer-badge')).toHaveText('1');
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test('시설 카드를 연 화면에 접근성 critical·serious 위반이 없다', async ({ page }) => {
    await page.getByRole('button', { name: /^레이어/ }).click();
    await page.getByRole('switch', { name: '119안전센터' }).click();
    await page.getByRole('button', { name: /^레이어/ }).click();
    await expect
      .poll(async () => (await page.evaluate(() => window.__mapDebug!.markers())).length)
      .toBeGreaterThan(0);
    const m = (await page.evaluate(() => window.__mapDebug!.markers())).find(
      (i) => i.kind === 'marker',
    )!;
    await page.mouse.click(m.x, m.y);
    await expect(page.getByTestId('poi-card')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  for (const tag of ['', '@desktop ']) {
    test(`${tag}셀 시트를 연 화면에 접근성 critical·serious 위반이 없다`, async ({ page }) => {
      // 제주시청 셀(등급 5)
      const [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.5312, 33.4996));
      await page.mouse.click(x, y);
      const sheet = page.getByTestId('cell-sheet');
      await expect(sheet).toBeVisible();
      // 주변 시설 숫자까지 채워진 뒤 검사한다
      await expect(sheet.getByRole('table')).not.toContainText('…');
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test('데이터 부족 셀 시트와 바다 시트에 접근성 critical·serious 위반이 없다', async ({
    page,
  }) => {
    let [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.53, 33.36));
    await page.mouse.click(x, y);
    const sheet = page.getByTestId('cell-sheet');
    await expect(sheet.getByTestId('sheet-badge')).toHaveText('데이터 부족');
    expect(await seriousViolations(page)).toEqual([]);
    [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.3, 33.7));
    await page.mouse.click(x, y);
    await expect(
      sheet.getByRole('heading', { name: '이 위치는 위험도 정보가 없어요' }),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  for (const tag of ['', '@desktop ']) {
    test(`${tag}검색 목록을 연 화면에 접근성 critical·serious 위반이 없다`, async ({ page }) => {
      const box = page.getByRole('combobox', { name: '읍면동 검색' });
      await box.fill('동');
      await expect(page.getByRole('listbox', { name: '읍면동 검색 결과' })).toBeVisible();
      await page.keyboard.press('ArrowDown');
      expect(await seriousViolations(page)).toEqual([]);
      await box.fill('서울');
      await expect(page.getByText("'서울'과 일치하는 읍면동이 없어요")).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});

// 상태 화면(U7): 로딩·오류·위치 안내
test.describe('상태 화면', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-17T10:00:00+09:00'));
  });

  for (const tag of ['', '@desktop ']) {
    test(`${tag}위험도를 받는 중 화면에 접근성 critical·serious 위반이 없다`, async ({ page }) => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      await page.route('**/data/scores.json', async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto('/');
      await expect(page.getByRole('status').filter({ hasText: '불러오는 중' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      release();
    });

    test(`${tag}위험도를 받지 못한 화면에 접근성 critical·serious 위반이 없다`, async ({
      page,
    }) => {
      await page.route('**/data/scores.json', (route) => route.abort());
      await page.goto('/');
      await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test(`${tag}위치 권한 안내 띠를 띄운 화면에 접근성 critical·serious 위반이 없다`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions([]);
      await page.goto('/');
      await page.waitForFunction(() => window.__mapReady === true);
      await page.getByRole('button', { name: '내 위치' }).click();
      await expect(page.getByTestId('location-banner')).toBeVisible();
      await expect(page.getByTestId('fallback-location').getByText('제주시청')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  for (const [name, at] of [
    ['내 위치로 옮긴', [126.56, 33.2539]],
    ['제주 밖 안내를 띄운', [126.978, 37.5665]],
  ] as const) {
    test(`${name} 화면에 접근성 critical·serious 위반이 없다`, async ({ page, context }) => {
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ longitude: at[0], latitude: at[1] });
      await page.goto('/');
      await page.waitForFunction(() => window.__mapReady === true);
      await page.getByRole('button', { name: '내 위치' }).click();
      if (at[1] < 34.05) await expect(page.getByTestId('my-location')).toBeVisible();
      else await expect(page.getByTestId('location-banner')).toContainText('제주 밖에 있어요');
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});
