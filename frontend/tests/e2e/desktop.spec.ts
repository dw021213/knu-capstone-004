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

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** 핵심 요소 가운데 화면에 보이는 것의 상자 */
async function visibleBoxes(page: Page) {
  const items: Record<string, import('@playwright/test').Locator> = {
    검색: page.getByRole('combobox', { name: '읍면동 검색' }),
    레이어: page.getByTestId('layer-button'),
    범례: page.getByTestId('legend'),
    날짜칩: page.getByTestId('date-bar').getByRole('group', { name: '날짜' }),
    날짜안내: page.getByTestId('date-bar').getByText('날씨 미반영 · 공간 점수는 날짜와 무관'),
    내위치: page.getByRole('button', { name: '내 위치' }),
    코스: page.getByRole('link', { name: '오늘 안전한 코스' }),
    셀정보: page.getByTestId('cell-sheet'),
    지도출처: page.getByRole('link', { name: '© OpenStreetMap contributors' }),
  };
  const out: [string, Box][] = [];
  for (const [name, l] of Object.entries(items)) {
    if ((await l.count()) === 0 || !(await l.first().isVisible())) continue;
    out.push([name, (await l.first().boundingBox())!]);
  }
  return out;
}

function overlaps(boxes: [string, Box][]) {
  const found: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (intersects(boxes[i][1], boxes[j][1])) found.push(`${boxes[i][0]}×${boxes[j][0]}`);
  return found;
}

for (const [w, h] of [
  [390, 844],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1440, 900],
] as const) {
  test.describe(`U9-3 ${w}×${h} 핵심 요소 겹침`, () => {
    test.use({ viewport: { width: w, height: h } });

    test(`@desktop ${w}px: 지도 홈과 셀을 고른 화면에서 검색·레이어·범례·날짜 칩·내 위치·셀 정보가 서로 겹치지 않는다`, async ({
      page,
    }) => {
      await openMap(page);
      const home = await visibleBoxes(page);
      expect(home.map(([n]) => n)).toEqual(
        expect.arrayContaining(['검색', '레이어', '범례', '날짜칩', '내위치', '코스']),
      );
      expect(overlaps(home)).toEqual([]);
      await pickLandCell(page);
      await expect(page.getByTestId('cell-sheet')).toBeVisible();
      // 펼침·이동이 끝난 뒤 잰다
      await page.waitForTimeout(300);
      const picked = await visibleBoxes(page);
      expect(picked.map(([n]) => n)).toEqual(
        expect.arrayContaining(['검색', '레이어', '범례', '날짜칩', '셀정보']),
      );
      expect(overlaps(picked)).toEqual([]);
    });
  });
}

test.describe('U9-2 데스크톱 코스 화면', () => {
  test('@desktop 1440 목록: 왼쪽에 지도와 코스 경로, 오른쪽 패널에 목록이 있다', async ({
    page,
  }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await page.goto('/courses');
    await page.waitForFunction(() => window.__mapReady === true);
    const list = page.getByRole('list', { name: '코스 목록' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    const l = (await list.boundingBox())!;
    const bar = (await page.getByRole('button', { name: '뒤로' }).boundingBox())!;
    // 본섬 가운데가 목록 왼쪽 지도 영역 안에, 뒤로 막대 아래에 온다
    await expect
      .poll(async () => {
        const [x, y] = await page.evaluate(() => window.__mapDebug!.project(126.53, 33.38));
        return x > 0 && x < l.x && y > bar.y + bar.height && y < 900;
      })
      .toBe(true);
    // 처음에는 목록 맨 위(위험 등급이 가장 낮은) 코스 경로와 주의 지점을 그린다
    const first = await page.evaluate(() => window.__mapDebug!.route());
    expect(first.lines).toBeGreaterThan(6);
    expect(first.marks.map((m) => m.label)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  test('@desktop 1440 목록: 코스 줄에 마우스를 올리거나 포커스하면 그 코스 경로와 주의 지점을 미리 보여 준다', async ({
    page,
  }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await page.goto('/courses');
    await page.waitForFunction(() => window.__mapReady === true);
    const link = (name: string) => page.getByRole('link', { name: new RegExp(name) });
    const marks = async () => (await page.evaluate(() => window.__mapDebug!.route())).marks.length;
    await link('제주올레 10코스').hover();
    await expect.poll(marks).toBe(8);
    await page.mouse.move(10, 450);
    await link('제주올레 1코스').focus();
    await expect.poll(marks).toBe(6);
  });

  test('@desktop 1440 상세: 오른쪽 400px 패널이 뒤로 막대 아래부터 바닥까지 붙고 지도 출처는 패널 왼쪽에 보인다', async ({
    page,
  }) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await page.goto('/courses/olle-1');
    await page.waitForFunction(() => window.__mapReady === true);
    const sheet = (await page.getByTestId('course-sheet').boundingBox())!;
    const bar = (await page.getByRole('button', { name: '뒤로' }).boundingBox())!;
    expect(Math.abs(sheet.width - 400)).toBeLessThan(2);
    expect(Math.abs(sheet.x + sheet.width - 1440)).toBeLessThan(1);
    expect(sheet.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(Math.abs(sheet.y + sheet.height - 900)).toBeLessThan(1);
    const credit = page.getByRole('link', { name: '© OpenStreetMap contributors' });
    const c = (await credit.boundingBox())!;
    expect(c.x + c.width).toBeLessThanOrEqual(sheet.x);
    await credit.click({ trial: true, timeout: 2000 });
  });
});

// 배경 지도 출처(OSM 타일 이용 조건)는 지도를 그리는 모든 화면에서 보이고 눌러야 한다
for (const [w, h] of [
  [1440, 900],
  [1024, 768],
  [820, 1180],
  [769, 1024],
  [390, 844],
] as const) {
  test.describe(`${w}×${h} 배경 지도 출처`, () => {
    test.use({ viewport: { width: w, height: h } });

    test(`@desktop ${w}px: 지도 홈(패널 닫힘·열림), 코스 목록, 코스 상세에서 배경 지도 출처가 보이고 눌린다`, async ({
      page,
    }) => {
      const credit = page.getByRole('link', { name: '© OpenStreetMap contributors', exact: true });
      const expectUsable = async (where: string) => {
        await expect(credit, where).toBeVisible();
        // 다른 요소(패널·카드)가 가로채면 trial 누르기가 실패한다
        await credit.click({ trial: true, timeout: 2000 });
      };
      await openMap(page);
      await expectUsable('지도 홈');
      await pickLandCell(page);
      await expect(page.getByTestId('cell-sheet')).toBeVisible();
      await expectUsable('셀을 고른 지도 홈');

      await page.goto('/courses');
      await expect(page.getByRole('list', { name: '코스 목록' }).getByRole('listitem')).toHaveCount(
        3,
      );
      if (w > 768) {
        await page.waitForFunction(() => window.__mapReady === true);
        await expectUsable('코스 목록');
      } else {
        // 모바일 목록은 지도를 그리지 않는다(출처를 표기할 배경 지도가 없다)
        await expect(page.getByTestId('map')).toHaveCount(0);
        await expect(credit).toHaveCount(0);
      }

      await page.goto('/courses/olle-1');
      await page.waitForFunction(() => window.__mapReady === true);
      await expect(page.getByTestId('course-sheet')).toBeVisible();
      await expectUsable('코스 상세');
    });
  });
}
