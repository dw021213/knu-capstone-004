/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// 데스크톱·반응형 배치(U9). 날짜 칩 글자 폭이 날짜마다 달라 겹침 판정이 흔들리지 않게 시계를 고정한다
const FIXED_NOW = new Date('2026-10-17T10:00:00+09:00');

async function openMap(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;

test.describe('U9-3 768px 이하는 모바일 배치', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('@desktop 768px: 범례는 위쪽에 접혀 있고 코스 진입은 날짜 칩 바로 위에 있다', async ({
    page,
  }) => {
    await openMap(page);
    const legend = page.getByTestId('legend');
    await expect(legend.getByRole('button', { name: '위험도 범례' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const lg = await box(page, 'legend');
    const bar = await box(page, 'date-bar');
    expect(lg.y).toBeLessThan(200);
    const link = (await page.getByRole('link', { name: '오늘 안전한 코스' }).boundingBox())!;
    expect(link.y + link.height).toBeLessThanOrEqual(bar.y);
    // 서비스 이름은 화면에 보이지 않는다(모바일은 맨 위가 검색창)
    const h1 = (await page
      .getByRole('heading', { level: 1, name: '제주 안전지도' })
      .boundingBox())!;
    expect(h1.width).toBeLessThanOrEqual(1);
  });
});

test.describe('U9-3 769px부터는 데스크톱 배치', () => {
  test.use({ viewport: { width: 769, height: 1024 } });

  test('@desktop 769px: 범례는 펼친 채 아래에, 코스 진입은 레이어 버튼 옆에 있다', async ({
    page,
  }) => {
    await openMap(page);
    const legend = page.getByTestId('legend');
    await expect(legend.getByRole('button', { name: '위험도 범례' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const lg = await box(page, 'legend');
    expect(lg.y + lg.height).toBeGreaterThan(1024 - 200);
    const link = (await page.getByRole('link', { name: '오늘 안전한 코스' }).boundingBox())!;
    const layer = await box(page, 'layer-button');
    expect(Math.abs(link.y - layer.y)).toBeLessThan(2);
    expect(link.x).toBeGreaterThan(layer.x + layer.width);
  });
});

test.describe('U9-1 데스크톱 헤더', () => {
  test('@desktop 1440: 머리글에 서비스 이름, 400px 검색창, 종합 라벨이 보이고 지도는 main 안에 있다', async ({
    page,
  }) => {
    await openMap(page);
    const banner = page.getByRole('banner');
    await expect(banner).toHaveCount(1);
    const title = banner.getByRole('heading', { level: 1, name: '제주 안전지도' });
    await expect(title).toBeVisible();
    const t = (await title.boundingBox())!;
    expect(t.width).toBeGreaterThan(40);
    const search = banner.getByRole('combobox', { name: '읍면동 검색' });
    const s = (await search.boundingBox())!;
    expect(Math.abs(s.width - 400)).toBeLessThan(2);
    // 이름 오른쪽 같은 줄
    expect(s.x).toBeGreaterThan(t.x + t.width);
    expect(Math.abs(s.y + s.height / 2 - (t.y + t.height / 2))).toBeLessThan(4);
    await expect(banner.getByTestId('risk-tabs').getByText('종합', { exact: true })).toBeVisible();
    // 지도와 지도 위 조작은 main('지도') 안
    const main = page.getByRole('main', { name: '지도' });
    await expect(main.getByTestId('map')).toBeVisible();
    await expect(main.getByTestId('legend')).toBeVisible();
  });
});

/** 땅 위 셀 하나(제주시 연동 근처)를 눌러 패널을 연다 */
async function pickLandCell(page: Page) {
  const [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.49, 33.45));
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).not.toHaveText('');
}

const panel = (page: Page) => page.getByRole('complementary', { name: '선택한 곳 정보' });

test.describe('U9-1 데스크톱 오른쪽 패널', () => {
  test('@desktop 1440: 셀을 고를 때만 머리글 아래 오른쪽 400px 패널이 열리고, 닫으면 선택이 풀린다', async ({
    page,
  }) => {
    await openMap(page);
    await expect(panel(page)).toHaveCount(0);
    await pickLandCell(page);
    await expect(panel(page)).toBeVisible();
    const p = (await panel(page).boundingBox())!;
    const header = (await page.getByRole('banner').boundingBox())!;
    expect(Math.abs(p.width - 400)).toBeLessThan(2);
    expect(Math.abs(p.x + p.width - 1440)).toBeLessThan(1);
    expect(Math.abs(p.y - (header.y + header.height))).toBeLessThan(2);
    expect(Math.abs(p.y + p.height - 900)).toBeLessThan(1);
    // 패널 안 셀 정보가 열리면 포커스가 그리로 간다
    await expect(page.getByTestId('cell-sheet')).toBeFocused();
    await panel(page).getByRole('button', { name: '닫기' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId('selected-cell')).toHaveText('');
  });

  test('@desktop 1440: 패널이 열려도 범례·날짜 칩·내 위치·지도 출처는 패널 왼쪽 지도 영역에 그대로 보인다', async ({
    page,
  }) => {
    await openMap(page);
    await pickLandCell(page);
    const p = (await panel(page).boundingBox())!;
    const targets = [
      page.getByTestId('legend'),
      page.getByTestId('date-bar').getByRole('group', { name: '날짜' }),
      page.getByRole('button', { name: '내 위치' }),
      page.getByRole('link', { name: '© OpenStreetMap contributors' }),
    ];
    for (const t of targets) {
      await expect(t).toBeVisible();
      const b = (await t.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(p.x);
    }
    // 날짜 칩은 지도 영역(패널 왼쪽)의 가운데
    const chips = (await targets[1].boundingBox())!;
    expect(Math.abs(chips.x + chips.width / 2 - p.x / 2)).toBeLessThan(2);
    // 범례는 지도 영역 오른쪽 아래, 내 위치는 그 위
    const legend = (await targets[0].boundingBox())!;
    const locate = (await targets[2].boundingBox())!;
    expect(p.x - (legend.x + legend.width)).toBeLessThan(24);
    expect(locate.y + locate.height).toBeLessThanOrEqual(legend.y);
    // 출처 링크를 다른 것이 가리지 않는다
    await targets[3].click({ trial: true, timeout: 2000 });
  });

  test('@desktop 1440: 검색으로 연 패널을 Esc로 닫으면 포커스가 검색창으로 돌아온다', async ({
    page,
  }) => {
    await openMap(page);
    const input = page.getByRole('combobox', { name: '읍면동 검색' });
    await input.fill('애월');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId('cell-sheet')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(input).toBeFocused();
  });
});
