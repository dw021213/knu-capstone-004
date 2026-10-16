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
