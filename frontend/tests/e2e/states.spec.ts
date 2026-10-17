/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';
import type { Page, Route } from '@playwright/test';

// 날짜 칩·달력 이름이 날짜에 기대므로 서울 2026-10-17(토) 10시로 고정한다
const FIXED_NOW = new Date('2026-10-17T10:00:00+09:00');

/** scores.json 요청을 붙잡아 두었다가 release()를 부르면 그대로 보낸다 */
async function holdScores(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/data/scores.json', async (route: Route) => {
    await gate;
    await route.continue();
  });
  return release;
}

/** 요소 가운데를 실제로 누른다(aria-disabled 요소는 locator.click이 기다리기만 한다) */
async function tap(page: Page, l: import('@playwright/test').Locator) {
  const b = (await l.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
});

test.describe('U7-1 로딩', () => {
  test('위험도를 받는 동안 배경 지도는 먼저 보이고 안내가 뜨며 범례·날짜 칩은 반응하지 않는다', async ({
    page,
  }) => {
    const release = await holdScores(page);
    await page.goto('/');
    const status = page.getByRole('status').filter({ hasText: '위험도를 불러오는 중이에요' });
    await expect(status).toBeVisible();
    // 배경 타일은 점수를 기다리지 않고 그려진다
    await expect(page.getByTestId('map').locator('img').first()).toBeVisible();
    expect(await page.evaluate(() => window.__mapReady === true)).toBe(false);

    const legendToggle = page.getByRole('button', { name: '위험도 범례' });
    await expect(legendToggle).toHaveAttribute('aria-disabled', 'true');
    await tap(page, legendToggle);
    await expect(legendToggle).toHaveAttribute('aria-expanded', 'false');

    const bar = page.getByTestId('date-bar');
    const today = bar.getByRole('button', { name: '오늘' });
    const pick = bar.getByRole('button', { name: '날짜 선택' });
    await expect(today).toHaveAttribute('aria-disabled', 'true');
    await expect(pick).toHaveAttribute('aria-disabled', 'true');
    await tap(page, pick);
    await expect(page.getByRole('dialog', { name: '날짜 선택' })).toHaveCount(0);

    // 점수가 없는 동안 육지를 눌러도 '위험도 정보 없음' 시트를 열지 않는다
    const [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.53, 33.36));
    await page.mouse.click(x, y);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('cell-sheet')).toHaveCount(0);

    release();
    await page.waitForFunction(() => window.__mapReady === true);
    await expect(status).toHaveCount(0);
    await expect(legendToggle).not.toHaveAttribute('aria-disabled', 'true');
    await expect(pick).not.toHaveAttribute('aria-disabled', 'true');
    // 대조: 같은 자리를 누르면 이제 반응한다
    await tap(page, legendToggle);
    await expect(legendToggle).toHaveAttribute('aria-expanded', 'true');
    await tap(page, legendToggle);
    await tap(page, pick);
    await expect(page.getByRole('dialog', { name: '날짜 선택' })).toBeVisible();
  });
});

test.describe('U7-3 불러오기 실패', () => {
  test('점수 요청이 실패하면 다시 시도 버튼이 있는 오류 안내를 띄우고, 다시 시도해 성공하면 셀을 그린다', async ({
    page,
  }) => {
    let calls = 0;
    await page.route('**/data/scores.json', async (route) => {
      calls++;
      if (calls === 1) await route.abort();
      else await route.continue();
    });
    await page.goto('/');
    const alert = page.getByRole('alert').filter({ hasText: '위험도를 불러오지 못했어요' });
    await expect(alert).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '불러오는 중' })).toHaveCount(0);
    // 저절로 다시 받지 않는다(사용자가 다시 시도를 누를 때만)
    await page.waitForTimeout(1500);
    expect(calls).toBe(1);
    expect(await page.evaluate(() => window.__mapReady === true)).toBe(false);

    await alert.getByRole('button', { name: '다시 시도' }).click();
    await page.waitForFunction(() => window.__mapReady === true);
    expect(calls).toBe(2);
    await expect(alert).toHaveCount(0);
    // 셀이 그려졌다: 제주시청 셀을 누르면 등급 시트가 열린다
    const [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.5312, 33.4996));
    await page.mouse.click(x, y);
    await expect(page.getByTestId('sheet-badge')).toBeVisible();
  });
});

const CITY_HALL: [number, number] = [126.5312, 33.4996];
const SEOGWIPO: [number, number] = [126.56, 33.2539];
const SEOUL: [number, number] = [126.978, 37.5665];

const project = (page: Page, [lng, lat]: [number, number]) =>
  page.evaluate(([a, b]) => window.__mapDebug!.project(a, b), [lng, lat] as const);
const zoomNow = (page: Page) => page.evaluate(() => window.__mapDebug!.zoom());

/** 위치 요청 횟수를 센다(처음 열 때 묻지 않는지 보려고) */
async function countGeoCalls(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    const g = navigator.geolocation;
    const get = g.getCurrentPosition.bind(g);
    const watch = g.watchPosition.bind(g);
    g.getCurrentPosition = (...a: Parameters<Geolocation['getCurrentPosition']>) => {
      w.__geoCalls++;
      return get(...a);
    };
    g.watchPosition = (...a: Parameters<Geolocation['watchPosition']>) => {
      w.__geoCalls++;
      return watch(...a);
    };
  });
}
const geoCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);

async function openReady(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

const locateButton = (page: Page) => page.getByRole('button', { name: '내 위치' });

test.describe('U7-2 내 위치', () => {
  test('처음 열 때는 위치를 묻지 않고, 내 위치 버튼은 오른쪽 아래(날짜 칩 위)에 있다', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ longitude: SEOGWIPO[0], latitude: SEOGWIPO[1] });
    await countGeoCalls(page);
    await openReady(page);
    await page.waitForTimeout(500);
    expect(await geoCalls(page)).toBe(0);
    const vp = page.viewportSize()!;
    const b = (await locateButton(page).boundingBox())!;
    const bar = (await page.getByTestId('date-bar').boundingBox())!;
    expect(b.x + b.width).toBeGreaterThan(vp.width - 24);
    expect(b.y).toBeGreaterThan(vp.height / 2);
    expect(b.y + b.height).toBeLessThanOrEqual(bar.y);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  });

  test('허용하면 내 위치로 옮겨 확대하고 위치 점을 그린다', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ longitude: SEOGWIPO[0], latitude: SEOGWIPO[1] });
    await countGeoCalls(page);
    await openReady(page);
    const z0 = await zoomNow(page);
    await locateButton(page).click();
    const vp = page.viewportSize()!;
    await expect.poll(() => zoomNow(page)).toBeGreaterThan(Math.max(12, z0 + 2));
    await expect
      .poll(async () => {
        const [x, y] = await project(page, SEOGWIPO);
        return Math.hypot(x - vp.width / 2, y - vp.height * 0.4);
      })
      .toBeLessThan(2);
    const dot = page.getByTestId('my-location');
    await expect(dot).toBeVisible();
    const d = (await dot.boundingBox())!;
    const [px, py] = await project(page, SEOGWIPO);
    expect(Math.abs(d.x + d.width / 2 - px)).toBeLessThan(3);
    expect(Math.abs(d.y + d.height / 2 - py)).toBeLessThan(3);
    expect(await geoCalls(page)).toBe(1);
    // 위치 점은 누르기를 가로채지 않는다(그 자리 셀이 골라진다)
    await page.mouse.click(px, py);
    await expect(page.getByTestId('selected-cell')).not.toHaveText('');
  });

  test('제주 밖이면 안내만 하고 지도를 옮기지 않는다', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ longitude: SEOUL[0], latitude: SEOUL[1] });
    await openReady(page);
    const z0 = await zoomNow(page);
    const p0 = await project(page, CITY_HALL);
    await locateButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: '제주 밖에 있어요' })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await zoomNow(page)).toBe(z0);
    expect(await project(page, CITY_HALL)).toEqual(p0);
    await expect(page.getByTestId('my-location')).toHaveCount(0);
  });

  for (const tag of ['', '@desktop ']) {
    test(`${tag}거부하면 제주시청으로 옮기고 위치 권한 안내 배너를 띄우며, 배너는 닫을 수 있다`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions([]);
      await openReady(page);
      await locateButton(page).click();
      const banner = page
        .getByRole('status')
        .filter({ hasText: '위치 권한을 켜면 내 주변 위험도를 볼 수 있어요' });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('제주시청');
      // 기준으로 삼은 곳을 지도에 이름과 함께 찍는다(위치 점은 찍지 않는다)
      const ref = page.getByTestId('fallback-location').getByText('제주시청');
      await expect(ref).toBeVisible();
      await expect(page.getByTestId('my-location')).toHaveCount(0);
      const vp = page.viewportSize()!;
      await expect.poll(() => zoomNow(page)).toBeGreaterThanOrEqual(12);
      await expect
        .poll(async () => {
          const [x, y] = await project(page, CITY_HALL);
          return Math.hypot(x - vp.width / 2, y - vp.height * 0.4);
        })
        .toBeLessThan(2);
      // 배너가 레이어 버튼·범례를 가리지 않는다(아래로 밀린다)
      const bb = (await banner.boundingBox())!;
      const layer = (await page.getByRole('button', { name: /^레이어/ }).boundingBox())!;
      expect(layer.y).toBeGreaterThanOrEqual(bb.y + bb.height);
      await page.getByRole('button', { name: /^레이어/ }).click();
      await expect(page.getByRole('region', { name: '시설 레이어' })).toBeVisible();
      await page.getByRole('button', { name: /^레이어/ }).click();

      await banner.getByRole('button', { name: '위치 안내 닫기' }).click();
      await expect(banner).toHaveCount(0);
    });
  }

  for (const tag of ['', '@desktop ']) {
    test(`${tag}셀 시트를 열면 모바일은 내 위치 버튼을 시트 뒤로 숨기고 데스크톱은 그대로 둔다`, async ({
      page,
    }) => {
      await openReady(page);
      const [x, y] = await project(page, CITY_HALL);
      await page.mouse.click(x, y);
      await expect(page.getByTestId('cell-sheet')).toBeVisible();
      if (tag) await expect(locateButton(page)).toBeVisible();
      else await expect(locateButton(page)).toBeHidden();
      await page.getByTestId('cell-sheet').getByRole('button', { name: '닫기' }).click();
      await expect(locateButton(page)).toBeVisible();
    });
  }

  test('@desktop 내 위치 버튼은 오른쪽 아래에 있고 범례 카드와 겹치지 않는다', async ({ page }) => {
    await openReady(page);
    const vp = page.viewportSize()!;
    const b = (await locateButton(page).boundingBox())!;
    const l = (await page.getByTestId('legend').boundingBox())!;
    expect(b.x + b.width).toBeGreaterThan(vp.width * 0.75);
    expect(b.y).toBeGreaterThan(vp.height / 2);
    const overlap =
      b.x < l.x + l.width && l.x < b.x + b.width && b.y < l.y + l.height && l.y < b.y + b.height;
    expect(overlap).toBe(false);
  });
});

test.describe('시설·읍면동·응급실 일부 실패', () => {
  test('CCTV·응급실·읍면동 파일을 받지 못해도 셀 시트의 나머지는 동작하고 그 부분만 불러오지 못했다고 한다', async ({
    page,
  }) => {
    for (const f of ['**/data/poi/cctv.json', '**/data/poi/er.json', '**/data/emd.json']) {
      await page.route(f, (r) => r.abort());
    }
    await openReady(page);
    const [x, y] = await project(page, CITY_HALL);
    await page.mouse.click(x, y);
    const sheet = page.getByTestId('cell-sheet');
    await expect(sheet.getByTestId('sheet-badge')).toBeVisible();
    await expect(sheet.getByRole('row', { name: /CCTV/ })).toContainText('불러오지 못했어요');
    await expect(sheet.getByRole('row', { name: /편의점/ })).not.toContainText('불러오지');
    await expect(sheet.getByRole('row', { name: /편의점/ })).not.toContainText('…');
    await expect(sheet.getByTestId('help-er')).toContainText('불러오지 못했어요');
    await expect(sheet.getByTestId('help-fire')).toContainText('119안전센터');
    await expect(sheet.getByTestId('help-fire')).not.toContainText('불러오지');
    await expect(sheet.getByTestId('sheet-place-error')).toHaveText(
      '지역 이름을 불러오지 못했어요',
    );
  });

  test('레이어 파일을 받지 못하면 그 토글만 불러오지 못했다고 하고 다른 레이어는 켜진다', async ({
    page,
  }) => {
    await page.route('**/data/poi/cctv.json', (r) => r.abort());
    await openReady(page);
    await page.getByRole('button', { name: /^레이어/ }).click();
    const panel = page.getByRole('region', { name: '시설 레이어' });
    await panel.getByRole('switch', { name: 'CCTV' }).click();
    await expect(panel.getByRole('switch', { name: 'CCTV' })).toContainText('불러오지 못했어요');
    await panel.getByRole('switch', { name: '편의점' }).click();
    await expect(page.getByTestId('layer-badge')).toBeVisible();
    await expect
      .poll(async () => (await page.evaluate(() => window.__mapDebug!.markers())).length)
      .toBeGreaterThan(0);
  });

  test('읍면동 목록을 받지 못하면 검색창 아래에 불러오지 못했다고 하고 지도는 그대로 쓴다', async ({
    page,
  }) => {
    await page.route('**/data/emd.json', (r) => r.abort());
    await openReady(page);
    await page.getByRole('combobox', { name: '읍면동 검색' }).fill('애월');
    await expect(page.getByText('읍면동 목록을 불러오지 못했어요')).toBeVisible();
    const [x, y] = await project(page, CITY_HALL);
    await page.mouse.click(x, y);
    await expect(page.getByTestId('sheet-badge')).toBeVisible();
  });
});

test.describe('U10 상태 문구와 비활성 겉모습', () => {
  test('오류·로딩 안내 문구는 낱말 중간에서 줄을 바꾸지 않는다(word-break: keep-all)', async ({
    page,
  }) => {
    const release = await holdScores(page);
    await page.goto('/');
    const loading = page.getByTestId('loading-banner');
    await expect(loading).toBeVisible();
    for (const p of await loading.locator('p').all())
      await expect(p).toHaveCSS('word-break', 'keep-all');
    release();
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    await page.route('**/data/scores.json', (route) => route.abort());
    await page.reload();
    const error = page.getByTestId('error-state');
    await expect(error).toBeVisible();
    for (const p of await error.locator('p').all())
      await expect(p).toHaveCSS('word-break', 'keep-all');
  });

  test('위치 권한 안내 배너 문구도 낱말 중간에서 줄을 바꾸지 않는다', async ({ page, context }) => {
    await context.grantPermissions([]);
    await page.goto('/');
    await page.waitForFunction(() => window.__mapReady === true);
    await page.getByRole('button', { name: '내 위치' }).click();
    const banner = page
      .getByRole('status')
      .filter({ hasText: '위치 권한을 켜면 내 주변 위험도를 볼 수 있어요' });
    await expect(banner).toBeVisible();
    for (const p of await banner.locator('p').all())
      await expect(p).toHaveCSS('word-break', 'keep-all');
  });
});
