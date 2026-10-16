/// <reference path="../../src/types/global.d.ts" />
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// 목록 머리의 날짜를 고정한다(10월 17일 토요일)
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T10:00:00+09:00'));
});

const courseList = (page: Page) => page.getByRole('list', { name: '코스 목록' });

async function rowFacts(page: Page) {
  return courseList(page)
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((li) => ({
        level: Number(li.getAttribute('data-level') ?? 'NaN'),
        cautionKm: Number(li.getAttribute('data-caution-km')),
        name: li.querySelector('h2')?.textContent,
      })),
    );
}

for (const tag of ['', '@desktop ']) {
  test(`${tag}U8-3 목록은 코스 등급 낮은 순, 같으면 주의 구간 길이 짧은 순이다`, async ({
    page,
  }) => {
    await page.goto('/courses');
    await expect(page.getByRole('heading', { level: 1, name: '오늘 안전한 코스' })).toBeVisible();
    await expect(courseList(page).getByRole('listitem')).toHaveCount(3);
    const facts = await rowFacts(page);
    for (let i = 1; i < facts.length; i++) {
      const [a, b] = [facts[i - 1], facts[i]];
      expect(a.level < b.level || (a.level === b.level && a.cautionKm <= b.cautionKm)).toBe(true);
    }
    // 배포본 점수로는 세 코스 모두 5단계 구간을 지나 주의 구간 길이로 줄을 세운다
    expect(facts.map((f) => f.name)).toEqual([
      '제주올레 1코스',
      '제주올레 10코스',
      '제주올레 20코스',
    ]);
  });
}

test('U8-3 행마다 등급 배지, 이름, 길이, 한 줄 이유가 있다', async ({ page }) => {
  await page.goto('/courses');
  const first = courseList(page).getByRole('listitem').first();
  await expect(first.getByTestId('level-badge')).toHaveText('5 · 매우 높음');
  await expect(first.getByRole('heading', { name: '제주올레 1코스' })).toBeVisible();
  await expect(first).toContainText('15.1km');
  await expect(first).toContainText('주의 구간 6곳 · 가장 위험한 구간 5단계');
  // 이 코스들은 데이터 부족 구간이 20% 아래라 따로 적지 않는다
  await expect(first).not.toContainText('데이터 부족 구간');
});

test('U8-3 목록 머리에 고른 날짜와 날짜 무관 안내, 경로 출처가 있다', async ({ page }) => {
  await page.goto('/courses');
  const head = page.getByTestId('courses-head');
  await expect(head).toContainText('10월 17일 (토)');
  await expect(head).toContainText('날씨 미반영 · 공간 점수는 날짜와 무관');
  await expect(head).toContainText('코스 등급은 가장 위험한 구간의 등급');
  await expect(page.getByRole('link', { name: /OpenStreetMap/ })).toBeVisible();
  // 단정하는 말을 쓰지 않는다
  await expect(page.locator('body')).not.toContainText(/안전합니다|안전해요|확률/);
});

test('U8-3 달력에서 고른 날짜가 목록 머리에 이어진다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
  await page.getByRole('button', { name: '날짜 선택' }).click();
  const dialog = page.getByRole('dialog', { name: '날짜 선택' });
  await dialog.getByRole('button', { name: '20, 10월 20일 (화)', exact: true }).click();
  await dialog.getByRole('button', { name: '10월 20일 (화) 보기' }).click();
  await page.getByRole('link', { name: '오늘 안전한 코스' }).click();
  await expect(page.getByTestId('courses-head')).toContainText('10월 20일 (화)');
});

test('코스 파일을 받지 못하면 다시 시도할 수 있는 안내', async ({ page }) => {
  let fail = true;
  await page.route('**/data/courses.json', (r) => (fail ? r.abort() : r.continue()));
  await page.goto('/courses');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('코스를 불러오지 못했어요');
  fail = false;
  await alert.getByRole('button', { name: '다시 시도' }).click();
  await expect(courseList(page).getByRole('listitem')).toHaveCount(3);
});

test('목록에서 뒤로 가기(화면 버튼, 브라우저)로 지도 홈에 돌아온다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
  await page.getByRole('link', { name: '오늘 안전한 코스' }).click();
  await expect(courseList(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('map')).toBeVisible();
  await page.goForward();
  await page.getByRole('button', { name: '뒤로' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('주소로 바로 들어와도 화면 뒤로 버튼은 지도 홈으로 간다', async ({ page }) => {
  await page.goto('/courses');
  await page.getByRole('button', { name: '뒤로' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForFunction(() => window.__mapReady === true);
});
