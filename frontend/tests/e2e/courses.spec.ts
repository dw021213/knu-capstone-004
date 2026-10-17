/// <reference path="../../src/types/global.d.ts" />
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { densify } from '../../src/entities/course/segments';
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

test('@desktop 데스크톱 목록은 머리와 목록이 같은 너비로 오른쪽 패널 한 줄에 놓인다', async ({
  page,
}) => {
  await page.goto('/courses');
  const head = (await page.getByTestId('courses-head').boundingBox())!;
  const list = (await courseList(page).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.abs(head.x - list.x)).toBeLessThan(1);
  expect(Math.abs(head.width - list.width)).toBeLessThan(1);
  // U9-2: 목록은 오른쪽 400px 패널(왼쪽 선 1px 안쪽)에 오른쪽 끝을 붙인다
  expect(Math.abs(list.x + list.width - vp.width)).toBeLessThan(1);
  expect(Math.abs(list.width - 399)).toBeLessThan(2);
});

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

test('코스를 받는 동안 불러오는 중, 코스 자료가 없으면 준비 중이라고 한다', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/data/courses.json', async (r) => {
    await gate;
    await r.fulfill({ json: { status: 'pending', source: '', items: [] } });
  });
  await page.goto('/courses');
  await expect(page.getByRole('status')).toHaveText('코스를 불러오는 중이에요');
  release();
  await expect(page.getByText('코스 자료를 준비 중이에요')).toBeVisible();
  await expect(courseList(page)).toHaveCount(0);
});

test('문서 제목은 화면마다 바뀌고 지도 홈으로 돌아오면 서비스 이름', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
  await expect(page).toHaveTitle('제주 안전지도');
  await page.getByRole('link', { name: '오늘 안전한 코스' }).click();
  await expect(page).toHaveTitle('오늘 안전한 코스 · 제주 안전지도');
  await courseList(page)
    .getByRole('link', { name: /제주올레 10코스/ })
    .click();
  await expect(page).toHaveTitle('제주올레 10코스 · 제주 안전지도');
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveTitle('제주 안전지도');
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

async function openDetail(page: Page, name = '제주올레 1코스') {
  await page.goto('/courses');
  await courseList(page)
    .getByRole('link', { name: new RegExp(name) })
    .click();
  await page.waitForFunction(() => window.__mapReady === true);
}

const cautionList = (page: Page) => page.getByRole('list', { name: '주의 구간 목록' });
const marks = (page: Page) => page.evaluate(() => window.__mapDebug!.route().marks);

test.describe('U8-4 코스 상세', () => {
  for (const tag of ['', '@desktop ']) {
    test(`${tag}지도에 구간별 색 경로와 주의 지점 번호를 그리고, 시트에 등급·설명·주의 구간·출처가 있다`, async ({
      page,
    }) => {
      await openDetail(page);
      await expect(page).toHaveURL(/\/courses\/olle-1$/);
      await expect(page.getByRole('heading', { level: 1, name: '제주올레 1코스' })).toBeVisible();
      const sheet = page.getByTestId('course-sheet');
      await expect(sheet.getByTestId('level-badge').first()).toHaveText('5 · 매우 높음');
      await expect(sheet.getByTestId('course-reason')).toContainText(
        '평균이 아니라 가장 위험한 구간을 기준',
      );
      const items = cautionList(page).getByRole('button');
      await expect(items).toHaveCount(6);
      await expect(items.first()).toContainText(/\d+\.\dkm|\d+\.\d~\d+\.\dkm/);
      await expect(items.first()).toContainText('상위');
      const route = await page.evaluate(() => window.__mapDebug!.route());
      expect(route.lines).toBeGreaterThan(6);
      expect(route.marks.map((m) => m.label)).toEqual(['1', '2', '3', '4', '5', '6']);
      const chips = sheet.getByRole('list', { name: '출처' });
      await expect(chips).toContainText('OpenStreetMap');
      await expect(chips).toContainText('교통사고 도로 모델');
      // 처음에는 코스 전체가 화면 안에 들어오고 주의 지점이 시트에 가리지 않는다
      const vp = page.viewportSize()!;
      const box = (await sheet.boundingBox())!;
      await expect
        .poll(async () =>
          (await marks(page)).every(
            (m) => m.x > 0 && m.x < vp.width && m.y > 0 && (tag ? m.x < box.x : m.y < box.y),
          ),
        )
        .toBe(true);
    });
  }

  for (const tag of ['', '@desktop ']) {
    for (const id of ['olle-1', 'olle-10', 'olle-20']) {
      test(`${tag}${id} 처음 화면에 코스 시작·끝과 주의 지점이 모두 시트·패널에 가리지 않고 보인다`, async ({
        page,
      }) => {
        const course = (
          (await (await page.request.get('/data/courses.json')).json()).items as {
            id: string;
            coords: [number, number][];
          }[]
        ).find((c) => c.id === id)!;
        await page.goto(`/courses/${id}`);
        await page.waitForFunction(() => window.__mapReady === true);
        const vp = page.viewportSize()!;
        const sheet = (await page.getByTestId('course-sheet').boundingBox())!;
        const bar = (await page.getByRole('button', { name: '뒤로' }).boundingBox())!;
        const visible = ([x, y]: [number, number]) =>
          x > 0 && y > bar.y + bar.height && (tag ? x < sheet.x : x < vp.width && y < sheet.y);
        await expect
          .poll(async () => {
            const ends = await page.evaluate(
              ([a, b]) => [window.__mapDebug!.project(...a), window.__mapDebug!.project(...b)],
              [course.coords[0], course.coords[course.coords.length - 1]] as const,
            );
            const ms = (await marks(page)).map((m) => [m.x, m.y] as [number, number]);
            return [...ends, ...ms].every(visible);
          })
          .toBe(true);
      });
    }
  }

  test('지도에 코스 시작(0km)과 끝 표지를 경로 양 끝에 그린다', async ({ page }) => {
    const course = (
      (await (await page.request.get('/data/courses.json')).json()).items as {
        id: string;
        coords: [number, number][];
      }[]
    ).find((c) => c.id === 'olle-1')!;
    await openDetail(page);
    await expect.poll(() => page.evaluate(() => window.__mapDebug!.focusDone())).toBe(0);
    const { ends } = await page.evaluate(() => window.__mapDebug!.route());
    expect(ends.map((e) => e.label)).toEqual(['시작', '끝']);
    const want = await page.evaluate(
      ([a, b]) => [window.__mapDebug!.project(...a), window.__mapDebug!.project(...b)],
      [course.coords[0], course.coords[course.coords.length - 1]] as const,
    );
    ends.forEach((e, i) => {
      expect(Math.abs(e.x - want[i][0])).toBeLessThan(1);
      expect(Math.abs(e.y - want[i][1])).toBeLessThan(1);
    });
  });

  test('주의 구간을 누르면 지도가 그 구간으로 옮겨 확대한다(키보드로도)', async ({ page }) => {
    await openDetail(page);
    await expect.poll(async () => (await marks(page)).length).toBe(6);
    // 처음 코스 전체 맞춤(key 0) 옮기기가 끝난 뒤의 줌을 기준으로 삼는다
    await expect.poll(() => page.evaluate(() => window.__mapDebug!.focusDone())).toBe(0);
    const before = await page.evaluate(() => window.__mapDebug!.zoom());
    const items = cautionList(page).getByRole('button');
    await items.nth(2).click();
    await expect(items.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => page.evaluate(() => window.__mapDebug!.zoom()))
      .toBeGreaterThan(before + 1);
    // 3번 지점이 화면 가운데 위쪽(시트 위)에 온다
    const vp = page.viewportSize()!;
    const sheetBox = (await page.getByTestId('course-sheet').boundingBox())!;
    await expect
      .poll(async () => {
        const m = (await marks(page)).find((x) => x.label === '3')!;
        return Math.abs(m.x - vp.width / 2) < vp.width * 0.15 && m.y > 0 && m.y < sheetBox.y;
      })
      .toBe(true);
    // 키보드: 다음 항목으로 옮겨 Enter
    await items.nth(4).focus();
    await page.keyboard.press('Enter');
    await expect(items.nth(4)).toHaveAttribute('aria-pressed', 'true');
    await expect(items.nth(2)).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(async () => {
        const m = (await marks(page)).find((x) => x.label === '5')!;
        return Math.abs(m.x - vp.width / 2) < vp.width * 0.15;
      })
      .toBe(true);
  });

  test('뒤로 가기(브라우저)로 목록, 한 번 더 뒤로 가면 지도 홈', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__mapReady === true);
    await page.getByRole('link', { name: '오늘 안전한 코스' }).click();
    await courseList(page)
      .getByRole('link', { name: /제주올레 10코스/ })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: '제주올레 10코스' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/courses$/);
    await expect(courseList(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForFunction(() => window.__mapReady === true);
  });

  test('화면 뒤로 버튼은 목록으로 간다(주소로 바로 들어와도)', async ({ page }) => {
    await page.goto('/courses/olle-20');
    await expect(page.getByRole('heading', { level: 1, name: '제주올레 20코스' })).toBeVisible();
    await page.getByRole('button', { name: '뒤로' }).click();
    await expect(page).toHaveURL(/\/courses$/);
    await expect(courseList(page)).toBeVisible();
  });

  for (const tag of ['', '@desktop ']) {
    test(`${tag}코스 상세에서 처음 Tab을 누르면 뒤로 버튼으로 간다`, async ({ page }) => {
      await page.goto('/courses/olle-20');
      await expect(page.getByRole('heading', { level: 1, name: '제주올레 20코스' })).toBeVisible();
      await expect(page.getByTestId('course-sheet')).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: '뒤로' })).toBeFocused();
      // 뒤로 막대는 지도와 출처 위에 그대로 보인다
      const back = (await page.getByRole('button', { name: '뒤로' }).boundingBox())!;
      const top = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'),
        [back.x + back.width / 2, back.y + back.height / 2] as const,
      );
      expect(top).toBe('뒤로');
    });
  }

  test('없는 코스 주소는 찾지 못했다고 하고 목록으로 가는 길을 준다', async ({ page }) => {
    await page.goto('/courses/olle-99');
    await expect(page.getByText('코스를 찾지 못했어요')).toBeVisible();
    await page.getByRole('link', { name: '코스 목록 보기' }).click();
    await expect(courseList(page)).toBeVisible();
  });

  test('지도를 눌러도 셀 시트를 열지 않는다(코스 화면은 구간 정보만)', async ({ page }) => {
    await openDetail(page);
    const vp = page.viewportSize()!;
    await page.mouse.click(vp.width / 2, 120);
    await page.waitForTimeout(600);
    await expect(page.getByTestId('cell-sheet')).toHaveCount(0);
  });

  test('@desktop 경로가 지나지 않는 셀은 불투명도 0.15로 흐리게 칠한다', async ({ page }) => {
    const get = async (u: string) => (await page.request.get(u)).json();
    const cells = (await get('/data/scores.json')).cells as Record<string, [number | null, number]>;
    const course = (await get('/data/courses.json')).items.find(
      (c: { id: string }) => c.id === 'olle-1',
    ) as { coords: [number, number][] };
    const onRoute = new Set(densify(course.coords).map(([lng, lat]) => latLngToCell(lat, lng, 8)));
    // 경로에서 두 칸 떨어진, 등급이 있는 셀
    const off = [...onRoute]
      .flatMap((h) => gridDisk(h, 2))
      .find(
        (h) =>
          !onRoute.has(h) && gridDisk(h, 1).every((n) => !onRoute.has(n)) && cells[h]?.[0] != null,
      )!;
    expect(off).toBeDefined();
    await openDetail(page);
    await expect.poll(async () => (await marks(page)).length).toBe(6);
    await page.waitForTimeout(400);
    const [lat, lng] = cellToLatLng(off);
    const [x, y] = await page.evaluate(([a, b]) => window.__mapDebug!.project(a, b), [
      lng,
      lat,
    ] as const);
    const alpha = await page.evaluate(
      ([px, py]) => {
        const c = document.querySelector<HTMLCanvasElement>('[data-testid="map"] canvas')!;
        const rect = c.getBoundingClientRect();
        const dpr = c.width / rect.width;
        const d = c
          .getContext('2d')!
          .getImageData(
            Math.round((px - rect.left) * dpr),
            Math.round((py - rect.top) * dpr),
            1,
            1,
          ).data;
        return d[3];
      },
      [x, y] as const,
    );
    // 0.15 × 255 ≈ 38 (흐리지 않으면 0.5 × 255 ≈ 128)
    expect(Math.abs(alpha - 38)).toBeLessThanOrEqual(4);
  });
});
