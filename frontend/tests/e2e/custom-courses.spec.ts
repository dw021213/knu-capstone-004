/// <reference path="../../src/types/global.d.ts" />
import AxeBuilder from '@axe-core/playwright';
import { test, expect, fakeKakao, type FakeKakaoDoc } from './fixtures';
import type { Page } from '@playwright/test';

const STORE = 'jeju-safety.my-courses.v1';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-17T10:00:00+09:00'));
});

const tabs = (page: Page) => page.getByRole('navigation', { name: '코스 종류' });
const olleList = (page: Page) => page.getByRole('list', { name: '올레 코스 목록' });
const mapReady = (page: Page) => page.waitForFunction(() => window.__mapReady === true);

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }));
}

interface SeedStop {
  name: string;
  lat: number;
  lng: number;
  source?: string;
}
async function seed(page: Page, courses: { id: string; name: string; stops: SeedStop[] }[]) {
  const value = JSON.stringify({
    courses: courses.map((c) => ({
      ...c,
      stops: c.stops.map((s, i) => ({ source: 'map', ...s, id: `${c.id}-${i}` })),
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-17T00:00:00.000Z',
    })),
  });
  // 한 번만 넣는다(새로고침해도 앱이 바꾼 값을 덮어쓰지 않게)
  await page.addInitScript(
    ([key, v]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, v);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [STORE, value] as const,
  );
}

const JEJU_MOK = { name: '제주목 관아', lat: 33.5137, lng: 126.5219 };
const CHUSA = { name: '추사관', lat: 33.2459, lng: 126.2768 };
const HANGPA = { name: '항파두리 항몽유적지', lat: 33.4497, lng: 126.4073 };

/** '공항'으로 찾히는 가짜 카카오 문서: 제주 밖 1건(bounds로 빠짐) + 제주 안 17건(15건 + 2건, 두 쪽) */
const AIRPORT_DOCS: FakeKakaoDoc[] = [
  {
    id: 'gimpo',
    place_name: '김포국제공항',
    category_name: '교통,수송 > 공항',
    road_address_name: '서울 강서구 하늘길 112',
    address_name: '',
    x: '126.8013',
    y: '37.5587',
  },
  ...Array.from({ length: 17 }, (_, i) => ({
    id: `k${i}`,
    place_name: i === 0 ? '제주국제공항' : `제주공항 가게 ${i}`,
    category_name: i === 0 ? '교통,수송 > 공항' : '음식점 > 한식',
    road_address_name: i % 4 === 3 ? '' : `제주특별자치도 제주시 공항로 ${i + 1}`,
    address_name: `제주특별자치도 제주시 용담이동 ${2000 + i}`,
    x: String(126.4929 + (i % 5) * 0.004),
    y: String(33.5066 - Math.floor(i / 5) * 0.003),
  })),
];

test.describe('탭', () => {
  for (const tag of ['', '@desktop ']) {
    test(`${tag}탭은 올레 코스와 내 코스, 처음은 올레이고 고른 탭은 주소에 남는다`, async ({
      page,
    }) => {
      await page.goto('/courses');
      await expect(tabs(page).getByRole('link')).toHaveText(['올레 코스', '내 코스']);
      await expect(tabs(page).getByRole('link', { name: '올레 코스' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(olleList(page).getByRole('listitem')).toHaveCount(3);
      await tabs(page).getByRole('link', { name: '내 코스' }).click();
      await expect(page).toHaveURL(/\/courses\?tab=mine$/);
      await page.reload();
      await expect(tabs(page).getByRole('link', { name: '내 코스' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByText('아직 만든 코스가 없어요')).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/courses$/);
      await expect(olleList(page)).toBeVisible();
    });
  }

  test('예전 인문학 탭과 인문학 코스 주소는 깨지지 않고 올레 목록과 없는 코스 안내로 간다', async ({
    page,
  }) => {
    await page.goto('/courses?tab=humanities');
    await expect(tabs(page).getByRole('link', { name: '올레 코스' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(olleList(page).getByRole('listitem')).toHaveCount(3);
    await page.goto('/courses/hum-01');
    await expect(page.getByText('코스를 찾지 못했어요')).toBeVisible();
    await page.getByRole('link', { name: '코스 목록 보기' }).click();
    await expect(page).toHaveURL(/\/courses$/);
    await expect(olleList(page)).toBeVisible();
  });

  test('내일을 고르면 내일 날씨가 아직 반영되지 않았다고 하고, 상세에서도 같은 날짜다', async ({
    page,
  }) => {
    await page.goto('/courses');
    const notice = page.getByTestId('date-notice');
    await expect(notice).toHaveText('날씨 미반영 · 공간 점수는 날짜와 무관');
    await page.getByRole('button', { name: '내일' }).click();
    await expect(page.getByRole('button', { name: '내일' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('courses-head')).toContainText('10월 18일 (일) 기준');
    await expect(notice).toHaveText('내일 날씨는 아직 반영되지 않았어요 · 공간 점수는 날짜와 무관');
    await olleList(page).getByRole('link').first().click();
    await expect(page.getByTestId('course-sheet').getByTestId('date-notice')).toHaveText(
      '내일 날씨는 아직 반영되지 않았어요 · 공간 점수는 날짜와 무관',
    );
    await page.getByRole('button', { name: '오늘' }).click();
    await expect(page.getByTestId('date-notice')).toHaveText(
      '날씨 미반영 · 공간 점수는 날짜와 무관',
    );
  });
});

test.describe('내 코스', () => {
  const search = (page: Page) => page.getByRole('combobox', { name: '장소 검색' });
  const draft = (page: Page) => page.getByTestId('draft-stop');
  const names = (page: Page) => page.getByTestId('draft-stop-name').allTextContents();
  const results = (page: Page) => page.getByRole('list', { name: '검색 결과' });
  const card = (page: Page) => page.getByTestId('place-card');
  const pinLabels = async (page: Page, kind?: string) =>
    (await page.evaluate(() => window.__mapDebug!.pins()))
      .filter((p) => !kind || p.kind === kind)
      .map((p) => p.label);

  /** 검색어를 넣고 엔터로 검색 결과를 연 뒤, 그 줄의 추가 버튼으로 넣는다 */
  async function addFromResults(page: Page, query: string, name: string) {
    await search(page).fill(query);
    await search(page).press('Enter');
    await results(page)
      .getByRole('button', { name: new RegExp(`^[A-O] ${name} 추가$`) })
      .click();
  }

  /** 지도에서 [경도, 위도] 자리를 누른다(새 코스는 본섬 전체에 맞춘 뒤) */
  async function tapMap(page: Page, lngLat: [number, number]) {
    await expect.poll(() => page.evaluate(() => window.__mapDebug!.focusDone())).not.toBeNull();
    await page.waitForFunction(() => window.__mapDebug!.idle());
    const [x, y] = await page.evaluate(
      ([lng, lat]) => window.__mapDebug!.project(lng, lat),
      lngLat,
    );
    await page.mouse.click(x, y);
  }

  for (const tag of ['', '@desktop ']) {
    test(`${tag}'공항' 입력 뒤 엔터는 장소를 더하지 않고 검색 결과와 지도 글자 표지를 보이고, 추가를 눌러야 들어간다`, async ({
      page,
    }) => {
      await fakeKakao(page, AIRPORT_DOCS);
      await page.goto('/courses/mine/new');
      await mapReady(page);
      await search(page).fill('공항');
      await search(page).press('Enter');

      const sheet = page.getByTestId('course-editor');
      await expect(sheet).toHaveAttribute('data-mode', 'results');
      await expect(sheet.getByRole('heading', { name: '‘공항’ 검색 결과 17건' })).toBeVisible();
      const rows = results(page).getByRole('listitem');
      await expect(rows).toHaveCount(15);
      await expect(rows.first().getByRole('button', { name: 'A, 제주국제공항' })).toBeVisible();
      await expect(rows.first()).toContainText('공항 · 제주특별자치도 제주시 공항로 1');
      // 도로명 주소가 없으면 지번
      await expect(rows.nth(3)).toContainText('한식 · 제주특별자치도 제주시 용담이동 2003');
      await expect(sheet).not.toContainText('김포국제공항');
      expect(await pinLabels(page)).toEqual([...'ABCDEFGHIJKLMNO']);
      const calls = await page.evaluate(
        () => (window as unknown as { __kakaoCalls: { bounds: boolean }[] }).__kakaoCalls,
      );
      expect(calls.every((c) => c.bounds)).toBe(true);

      await page.getByRole('button', { name: '다음 결과' }).click();
      await expect(rows).toHaveCount(2);
      await expect(page.getByRole('navigation', { name: '결과 쪽' })).toContainText('2 / 2쪽');
      await expect.poll(() => pinLabels(page)).toEqual(['A', 'B']);
      await page.getByRole('button', { name: '이전 결과' }).click();
      await expect(rows).toHaveCount(15);

      await results(page).getByRole('button', { name: 'A 제주국제공항 추가' }).click();
      await expect(sheet).toHaveAttribute('data-mode', 'idle');
      await expect(search(page)).toHaveValue('');
      expect(await names(page)).toEqual(['제주국제공항']);
      await expect(draft(page).first()).toContainText('출발');
      expect(await pinLabels(page)).toEqual(['1']);

      // 이미 넣은 장소는 추가됨
      await search(page).fill('공항');
      await search(page).press('Enter');
      await expect(
        results(page).getByRole('button', { name: 'A 제주국제공항 추가됨' }),
      ).toBeDisabled();
      await page.getByRole('button', { name: '검색 닫기' }).click();
      await expect(sheet).toHaveAttribute('data-mode', 'idle');
      expect(await names(page)).toEqual(['제주국제공항']);
    });

    test(`${tag}지도의 결과 표지를 누르면 그 줄을 고르고, 모바일은 아래에 장소 카드를 띄운다`, async ({
      page,
    }) => {
      await fakeKakao(page, AIRPORT_DOCS);
      await page.goto('/courses/mine/new');
      await mapReady(page);
      await search(page).fill('공항');
      await search(page).press('Enter');
      await expect(results(page).getByRole('listitem')).toHaveCount(15);
      await page.waitForFunction(() => window.__mapDebug!.idle());
      await expect.poll(() => page.evaluate(() => window.__mapDebug!.focusDone())).toBe(1);
      const pin = (await page.evaluate(() => window.__mapDebug!.pins())).find(
        (p) => p.label === 'C',
      )!;
      await page.mouse.click(pin.x, pin.y);
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__mapDebug!.pins())).find((p) => p.active)?.label,
        )
        .toBe('C');
      await expect(page.getByTestId('result-row').nth(2)).toHaveAttribute('aria-current', 'true');
      const wide = page.viewportSize()!.width > 768;
      if (wide) {
        await expect(card(page)).toBeHidden();
      } else {
        await expect(card(page)).toBeVisible();
        await expect(card(page).getByRole('heading', { name: '제주공항 가게 2' })).toBeVisible();
        await card(page).getByRole('button', { name: '코스에 추가' }).click();
        await expect(page.getByTestId('course-editor')).toHaveAttribute('data-mode', 'idle');
        expect(await names(page)).toEqual(['제주공항 가게 2']);
      }
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test('한글 입력기로 조합 중 엔터를 쳐도 장소가 들어가지 않고 검색 결과만 뜬다', async ({
    page,
  }) => {
    await fakeKakao(page, AIRPORT_DOCS);
    await page.goto('/courses/mine/new');
    await mapReady(page);
    await search(page).click();
    const cdp = await page.context().newCDPSession(page);
    for (const text of ['공', '공하', '공항']) {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
    }
    // macOS 한글 입력기: 조합 중 엔터(keyCode 229) → 조합 확정 → 엔터
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 229,
    });
    await cdp.send('Input.insertText', { text: '공항' });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      text: '\r',
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await expect(results(page).getByRole('listitem')).toHaveCount(15);
    await expect(search(page)).toHaveValue('공항');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('course-editor')).toHaveAttribute('data-mode', 'idle');
    await expect(draft(page)).toHaveCount(0);
  });

  test('추천 목록에서 고르면 장소 카드만 띄우고, 코스에 추가를 눌러야 들어간다', async ({
    page,
  }) => {
    await fakeKakao(page, AIRPORT_DOCS);
    await page.goto('/courses/mine/new');
    await mapReady(page);
    await search(page).fill('공항');
    const listbox = page.getByRole('listbox', { name: '추천 장소' });
    await expect(listbox.getByRole('option')).toHaveCount(8);
    const first = listbox.getByRole('option').first();
    await expect(first.locator('strong')).toHaveText('공항');
    await expect(first).toContainText('공항 · 제주특별자치도 제주시 공항로 1');

    await search(page).press('ArrowDown');
    await expect(search(page)).toHaveAttribute(
      'aria-activedescendant',
      (await first.getAttribute('id'))!,
    );
    await search(page).press('Enter');
    await expect(card(page).getByRole('heading', { name: '제주국제공항' })).toBeVisible();
    await card(page).getByRole('button', { name: '닫기' }).click();
    await expect(draft(page)).toHaveCount(0);

    await search(page).fill('공항');
    await listbox.getByRole('option', { name: /제주공항 가게 1\b/ }).click();
    await expect(card(page).getByRole('heading', { name: '제주공항 가게 1' })).toBeVisible();
    expect(await pinLabels(page, 'draft')).toEqual(['+']);
    await card(page).getByRole('button', { name: '코스에 추가' }).click();
    expect(await names(page)).toEqual(['제주공항 가게 1']);
    expect(await pinLabels(page, 'draft')).toEqual([]);
  });

  test('지도를 누르면 그 자리 임시 핀과 카드만 뜨고, 다른 곳을 누르면 옮겨 가고, 바로 앞과 같은 곳은 막는다', async ({
    page,
  }) => {
    await page.goto('/courses/mine/new');
    await mapReady(page);
    await tapMap(page, [126.55, 33.43]);
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByRole('heading')).toHaveText(/지점$/);
    await expect(card(page)).toContainText('지도에서 고른 곳');
    const first = await page.evaluate(() =>
      window.__mapDebug!.pins().find((p) => p.kind === 'draft'),
    );
    await tapMap(page, [126.3, 33.4]);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__mapDebug!.pins().find((p) => p.kind === 'draft')))?.x,
      )
      .not.toBe(first?.x);
    await card(page).getByRole('button', { name: '닫기' }).click();
    await expect(card(page)).toHaveCount(0);
    expect(await pinLabels(page)).toEqual([]);
    await expect(draft(page)).toHaveCount(0);

    await tapMap(page, [126.55, 33.43]);
    await card(page).getByRole('button', { name: '코스에 추가' }).click();
    await expect(draft(page)).toHaveCount(1);
    await tapMap(page, [126.55, 33.43]);
    await expect(card(page).getByRole('status')).toHaveText('이미 바로 앞에 넣은 장소예요');
    await expect(card(page).getByRole('button', { name: '코스에 추가' })).toBeDisabled();
  });

  for (const tag of ['', '@desktop ']) {
    test(`${tag}검색 결과와 지도 누르기로 장소를 더하고 순서를 바꿔 저장하면, 새로고침해도 남고 등급이 보인다`, async ({
      page,
    }) => {
      await page.goto('/courses?tab=mine');
      await page.getByRole('link', { name: '새 코스 만들기' }).click();
      await expect(page).toHaveURL(/\/courses\/mine\/new$/);
      await mapReady(page);
      await expect(page.getByRole('button', { name: '저장' })).toBeDisabled();

      // 지도 누르기: 한라산 북쪽 기슭(제주시 아라동 근처)
      await tapMap(page, [126.55, 33.43]);
      await card(page).getByRole('button', { name: '코스에 추가' }).click();
      await expect(draft(page)).toHaveCount(1);
      const tapped = (await names(page))[0];
      expect(tapped).toMatch(/지점$/);

      // 카카오를 못 쓰면 읍면동에서 찾는다
      await addFromResults(page, '애월', '애월읍');
      await addFromResults(page, '성산', '성산읍');
      await expect(page.getByTestId('draft-stop-name')).toHaveText([tapped, '애월읍', '성산읍']);
      await expect(page.getByTestId('stop-count')).toContainText('장소 3/10곳');
      await expect
        .poll(async () => (await page.evaluate(() => window.__mapDebug!.pins())).length)
        .toBe(3);
      await expect(draft(page).locator('button').first()).toHaveText('출발' + tapped);
      await expect(draft(page).nth(1).locator('button').first()).toHaveText('경유 1애월읍');
      await expect(draft(page).nth(2).locator('button').first()).toHaveText('도착성산읍');

      // 순서: 3번을 맨 위로, 3번(애월읍)을 뺀다
      await page.getByRole('button', { name: new RegExp(`^3번 .* 위로$`) }).click();
      await page.getByRole('button', { name: new RegExp(`^2번 .* 위로$`) }).click();
      await expect(page.getByTestId('draft-stop-name')).toHaveText(['성산읍', tapped, '애월읍']);
      await page.getByRole('button', { name: '3번 애월읍 빼기' }).click();
      await addFromResults(page, '한림', '한림읍');
      await expect(page.getByTestId('draft-stop-name')).toHaveText(['성산읍', tapped, '한림읍']);

      await page.getByRole('textbox', { name: '코스 이름' }).fill('시연 코스');
      // OSRM은 막혀 있고 도보 API 주소가 없어 직선으로 잇는다
      await expect(page.getByTestId('draft-via')).toContainText('직선 연결');
      await page.getByRole('button', { name: '저장' }).click();
      await expect(page).toHaveURL(/\/courses\/mine\/[\w-]+$/);
      const sheet = page.getByTestId('course-sheet');
      await expect(page.getByRole('heading', { level: 1, name: '시연 코스' })).toBeVisible();
      await expect(sheet.getByTestId('level-badge').first()).toBeVisible();
      await expect(sheet.getByTestId('route-via')).toContainText('직선 연결');
      await expect(sheet.getByTestId('route-via')).toHaveAttribute('data-via', 'straight');
      await expect(sheet.getByTestId('stop-list').getByRole('listitem')).toHaveCount(3);
      await mapReady(page);
      await expect
        .poll(async () => (await page.evaluate(() => window.__mapDebug!.pins())).length)
        .toBe(3);

      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: '시연 코스' })).toBeVisible();
      await page.getByRole('button', { name: '뒤로' }).click();
      await expect(page).toHaveURL(/\/courses\?tab=mine$/);
      const row = page.getByRole('list', { name: '내 코스 목록' }).getByRole('listitem');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('시연 코스');
      await expect(row).toContainText('장소 3곳 · 직선 연결');
      await expect(row.getByTestId('level-badge')).toBeVisible();
    });
  }

  test('검색 결과가 없으면 지도를 눌러 더할 수 있다고 알리고, 카카오를 못 쓰면 읍면동에서만 찾는다고 알린다', async ({
    page,
  }) => {
    await page.goto('/courses/mine/new');
    await search(page).fill('없는장소');
    // SDK를 받지 못하면 그때부터 읍면동에서만 찾는다고 알린다
    await expect(page.getByTestId('kakao-off')).toHaveText(
      '카카오 장소 검색을 쓸 수 없어 읍면동 이름에서만 찾아요',
    );
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByTestId('search-results').getByRole('status')).toHaveText(
      '‘없는장소’ 검색 결과가 없어요. 지도를 눌러 직접 더할 수도 있어요.',
    );
    await page.getByRole('button', { name: '검색어 지우기' }).click();
    await expect(search(page)).toHaveValue('');
    await expect(search(page)).toBeFocused();
  });

  test('길찾기(OSRM)가 되면 도로 경로로 잇고 그렇게 밝힌다', async ({ page }) => {
    let calls = 0;
    await page.route('**/router.project-osrm.org/**', (r) => {
      calls++;
      const [a, b] = new URL(r.request().url()).pathname
        .split('/')
        .pop()!
        .split(';')
        .map((p) => p.split(',').map(Number));
      // 두 장소 사이를 꺾어 지나는 가짜 도로
      const mid = [(a[0] + b[0]) / 2 + 0.02, (a[1] + b[1]) / 2];
      return r.fulfill({
        json: { code: 'Ok', routes: [{ geometry: { coordinates: [a, mid, b] } }] },
      });
    });
    await seed(page, [{ id: 'road', name: '도로 코스', stops: [JEJU_MOK, HANGPA] }]);
    await page.goto('/courses/mine/road');
    const via = page.getByTestId('route-via');
    await expect(via).toHaveAttribute('data-via', 'osrm');
    await expect(via).toContainText('도로 경로');
    await expect(via).toContainText('자동차 도로 길찾기(OSRM)');
    await expect(
      page.getByTestId('course-sheet').getByRole('list', { name: '출처' }),
    ).toContainText('OSRM');
    expect(calls).toBe(1);
  });

  test('길찾기가 실패하면 직선 연결임을 눈에 띄게 밝힌다', async ({ page }) => {
    await seed(page, [{ id: 'line', name: '직선 코스', stops: [JEJU_MOK, CHUSA] }]);
    await page.goto('/courses/mine/line');
    const via = page.getByTestId('route-via');
    await expect(via).toHaveAttribute('data-via', 'straight');
    await expect(via).toContainText('직선 연결');
    await expect(via).toContainText('실제 길과 달라');
    // 검정 테두리·흰 바탕으로 다른 안내(회색 테두리)와 구분한다
    expect(await via.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(17, 17, 17)');
  });

  test('예전 판에서 인문학 코스 장소로 만든 코스도 그대로 열리고 고칠 수 있다', async ({
    page,
  }) => {
    await seed(page, [
      {
        id: 'old',
        name: '예전 코스',
        stops: [
          { ...JEJU_MOK, source: 'humanities' },
          { ...CHUSA, source: 'humanities' },
        ],
      },
    ]);
    await page.goto('/courses?tab=mine');
    await page.getByRole('link', { name: /예전 코스/ }).click();
    await expect(page.getByTestId('stop-list').getByRole('listitem')).toHaveText([
      /제주목 관아/,
      /추사관/,
    ]);
    await page.getByRole('link', { name: '코스 고치기' }).click();
    await expect(page.getByTestId('draft-stop-name')).toHaveText(['제주목 관아', '추사관']);
  });

  test('고치기에서 순서를 바꿔 저장하면 상세로 돌아오고, 지우기는 한 번 더 묻는다', async ({
    page,
  }) => {
    await seed(page, [{ id: 'fix', name: '고칠 코스', stops: [JEJU_MOK, CHUSA, HANGPA] }]);
    await page.goto('/courses?tab=mine');
    await page.getByRole('link', { name: /고칠 코스/ }).click();
    await page.getByRole('link', { name: '코스 고치기' }).click();
    await expect(page).toHaveURL(/\/courses\/mine\/fix\/edit$/);
    await expect(draft(page)).toHaveCount(3);
    await page.getByRole('button', { name: '1번 제주목 관아 아래로' }).click();
    await page.getByRole('textbox', { name: '코스 이름' }).fill('고친 코스');
    await page.getByRole('button', { name: '저장' }).click();
    await expect(page).toHaveURL(/\/courses\/mine\/fix$/);
    await expect(page.getByRole('heading', { level: 1, name: '고친 코스' })).toBeVisible();
    await expect(page.getByTestId('stop-list').getByRole('listitem').first()).toContainText(
      '추사관',
    );

    await page.getByRole('button', { name: '코스 지우기' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      '이 코스를 지울까요? 이 기기에서 지우면 되돌릴 수 없어요.',
    );
    await page.getByRole('button', { name: '그만두기' }).click();
    await page.getByRole('button', { name: '코스 지우기' }).click();
    await page.getByRole('button', { name: '지우기', exact: true }).click();
    await expect(page).toHaveURL(/\/courses\?tab=mine$/);
    await expect(page.getByText('아직 만든 코스가 없어요')).toBeVisible();
  });

  test('장소가 10곳이면 검색과 지도 누르기로 더 넣지 않는다', async ({ page }) => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      name: `장소 ${i + 1}`,
      lat: 33.3 + i * 0.01,
      lng: 126.3 + i * 0.04,
    }));
    await seed(page, [{ id: 'full', name: '꽉 찬 코스', stops: ten }]);
    await page.goto('/courses/mine/full/edit');
    await mapReady(page);
    await expect(page.getByTestId('stop-count')).toContainText('장소 10/10곳');
    await expect(page.getByTestId('stop-count')).toContainText('장소는 10곳까지 넣을 수 있어요');
    await expect(search(page)).toBeDisabled();
    await page.waitForTimeout(300);
    const vp = page.viewportSize()!;
    await page.mouse.click(vp.width / 2, 200);
    await page.waitForTimeout(600);
    await expect(card(page)).toHaveCount(0);
    await expect(draft(page)).toHaveCount(10);
  });

  test('만들기에서 취소하면 목록으로 돌아가고, 한 번 더 뒤로 가면 그 전 화면이다', async ({
    page,
  }) => {
    await page.goto('/');
    await mapReady(page);
    await page.goto('/courses?tab=mine');
    await page.getByRole('link', { name: '새 코스 만들기' }).click();
    await expect(page).toHaveURL(/\/courses\/mine\/new$/);
    await page.getByRole('link', { name: '취소' }).click();
    await expect(page).toHaveURL(/\/courses\?tab=mine$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test('없는 내 코스 주소는 찾지 못했다고 하고 내 코스 목록으로 가는 길을 준다', async ({
    page,
  }) => {
    await page.goto('/courses/mine/nope');
    await expect(page.getByText('코스를 찾지 못했어요')).toBeVisible();
    await page.getByRole('link', { name: '코스 목록 보기' }).click();
    await expect(page).toHaveURL(/\/courses\?tab=mine$/);
  });

  for (const tag of ['', '@desktop ']) {
    test(`${tag}만들기 화면(추천, 검색 결과, 장소 카드)과 내 코스 결과에 접근성 critical·serious 위반이 없다`, async ({
      page,
    }) => {
      await fakeKakao(page, AIRPORT_DOCS);
      await seed(page, [{ id: 'a11y', name: '접근성 코스', stops: [JEJU_MOK, CHUSA] }]);
      await page.goto('/courses/mine/a11y/edit');
      await mapReady(page);
      await expect(draft(page)).toHaveCount(2);
      expect(await seriousViolations(page)).toEqual([]);
      await search(page).fill('공항');
      await expect(page.getByRole('option')).toHaveCount(8);
      expect(await seriousViolations(page)).toEqual([]);
      await search(page).press('Enter');
      await expect(results(page).getByRole('listitem')).toHaveCount(15);
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByRole('button', { name: '검색 닫기' }).click();
      await search(page).fill('공항');
      await page.getByRole('option').first().click();
      await expect(card(page)).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await page.goto('/courses/mine/a11y');
      await expect(page.getByTestId('route-via')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});
