/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';

// 날짜가 지나도 깨지지 않게 서울 2026-10-17(토) 10시로 고정한다(이 파일만)
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T10:00:00+09:00'));
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
});

const bar = (page: import('@playwright/test').Page) => page.getByTestId('date-bar');
const sheet = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: '날짜 선택' });

test('처음은 오늘 칩이 선택되어 있고 오늘 날짜를 보여 준다', async ({ page }) => {
  const today = bar(page).getByRole('button', { name: '오늘' });
  const pick = bar(page).getByRole('button', { name: '날짜 선택' });
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(pick).toHaveAttribute('aria-pressed', 'false');
  await expect(bar(page).getByText('10월 17일 (토)')).toBeVisible();
  for (const b of [today, pick]) {
    const box = (await b.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  // 지도 아래쪽
  const vp = page.viewportSize()!;
  const box = (await bar(page).boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(vp.height - 100);
});

test('날짜 선택은 달력 시트로 열리고, 지난 날짜는 고를 수 없다', async ({ page }) => {
  await bar(page).getByRole('button', { name: '날짜 선택' }).click();
  const s = sheet(page);
  await expect(s).toBeVisible();
  await expect(s.getByRole('heading', { name: '2026년 10월' })).toBeVisible();
  await expect(s.getByRole('button', { name: '10월 16일 (금)', exact: true })).toBeDisabled();
  await expect(s.getByRole('button', { name: '10월 1일 (목)', exact: true })).toBeDisabled();
  await expect(s.getByRole('button', { name: '10월 17일 (토)', exact: true })).toBeEnabled();
  await expect(s.getByRole('button', { name: '10월 17일 (토)', exact: true })).toHaveAttribute(
    'aria-current',
    'date',
  );
  await expect(s.getByRole('button', { name: '이전 달' })).toBeDisabled();
  // 시트 아래쪽에 붙는다(하단 시트)
  const vp = page.viewportSize()!;
  const box = (await s.boundingBox())!;
  expect(Math.abs(box.y + box.height - vp.height)).toBeLessThan(2);
});

test('날짜를 고르고 보기를 누르면 칩에 10월 20일 (화)가 표시된다', async ({ page }) => {
  await bar(page).getByRole('button', { name: '날짜 선택' }).click();
  const s = sheet(page);
  await s.getByRole('button', { name: '10월 20일 (화)', exact: true }).click();
  await expect(s.getByRole('button', { name: '10월 20일 (화)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await s.getByRole('button', { name: '10월 20일 (화) 보기' }).click();
  await expect(s).toBeHidden();
  const chip = bar(page).getByRole('button', { name: '10월 20일 (화)', exact: true });
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(bar(page).getByRole('button', { name: '오늘' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // 오늘로 돌아가기
  await bar(page).getByRole('button', { name: '오늘' }).click();
  await expect(bar(page).getByRole('button', { name: '오늘' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(bar(page).getByRole('button', { name: '날짜 선택' })).toBeVisible();
});

test('다음 달로 넘겨 고를 수 있다', async ({ page }) => {
  await bar(page).getByRole('button', { name: '날짜 선택' }).click();
  const s = sheet(page);
  await s.getByRole('button', { name: '다음 달' }).click();
  await expect(s.getByRole('heading', { name: '2026년 11월' })).toBeVisible();
  await expect(s.getByRole('button', { name: '이전 달' })).toBeEnabled();
  await s.getByRole('button', { name: '11월 3일 (화)', exact: true }).click();
  await s.getByRole('button', { name: '11월 3일 (화) 보기' }).click();
  await expect(bar(page).getByRole('button', { name: '11월 3일 (화)', exact: true })).toBeVisible();
});

test('닫기와 Escape는 고르지 않고 닫으며 포커스를 칩으로 돌려준다', async ({ page }) => {
  const pick = bar(page).getByRole('button', { name: '날짜 선택' });
  await pick.click();
  await sheet(page).getByRole('button', { name: '10월 21일 (수)', exact: true }).click();
  await sheet(page).getByRole('button', { name: '닫기' }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(pick).toBeFocused();
  await expect(bar(page).getByRole('button', { name: '오늘' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await pick.click();
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(pick).toBeFocused();
});

test('키보드만으로 날짜를 고른다', async ({ page }) => {
  const pick = bar(page).getByRole('button', { name: '날짜 선택' });
  await pick.focus();
  await page.keyboard.press('Enter');
  const s = sheet(page);
  await expect(s).toBeVisible();
  // 열리면 포커스가 시트 안(오늘 칸)으로 간다
  await expect(s.getByRole('button', { name: '10월 17일 (토)', exact: true })).toBeFocused();
  await s.getByRole('button', { name: '10월 23일 (금)', exact: true }).focus();
  await page.keyboard.press('Enter');
  await s.getByRole('button', { name: '10월 23일 (금) 보기' }).focus();
  await page.keyboard.press('Enter');
  await expect(
    bar(page).getByRole('button', { name: '10월 23일 (금)', exact: true }),
  ).toBeFocused();
});

test('배포본(snapshot)에서는 달력에 날씨 반영 점을 찍지 않는다', async ({ page }) => {
  await bar(page).getByRole('button', { name: '날짜 선택' }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByTestId('weather-dot')).toHaveCount(0);
});

test('@desktop 데스크톱에서도 날짜 칩이 지도 아래쪽 가운데에 있다', async ({ page }) => {
  const vp = page.viewportSize()!;
  const box = (await bar(page).boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(vp.height - 100);
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(40);
  await bar(page).getByRole('button', { name: '날짜 선택' }).click();
  await expect(sheet(page)).toBeVisible();
});
