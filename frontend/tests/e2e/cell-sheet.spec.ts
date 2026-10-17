/// <reference path="../../src/types/global.d.ts" />
import { cellToBoundary, cellToLatLng, latLngToCell } from 'h3-js';
import { distanceMeters, formatDistance } from '../../src/shared/geo/distance';
import { placeAt, placeLabel, type EmdFile } from '../../src/entities/place/emd';
import { LEVEL_NAME, levelFromPercentile } from '../../src/entities/risk/level';
import { test, expect, expectSelectionStays } from './fixtures';
import type { Page } from '@playwright/test';

// 날짜 칩을 누르는 테스트가 있어 서울 2026-10-17(토) 10시로 고정한다
const FIXED_NOW = new Date('2026-10-17T10:00:00+09:00');

const CITY_HALL: [number, number] = [126.5312, 33.4996];
const HALLA: [number, number] = [126.53, 33.36];
const SEA: [number, number] = [126.3, 33.7];
const UDO_CELL = '8830d10c49fffff';

type Item = { id: string; name: string; lng: number; lat: number };
const TYPES = [
  ['cctv', 'CCTV'],
  ['convenience', '편의점'],
  ['lodging', '숙박'],
  ['police', '경찰'],
  ['fire', '119안전센터'],
] as const;

async function openMap(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

const project = (page: Page, lng: number, lat: number) =>
  page.evaluate(([a, b]) => window.__mapDebug!.project(a, b), [lng, lat] as const);

function center(h3: string): [number, number] {
  const [lat, lng] = cellToLatLng(h3);
  return [lng, lat];
}

async function clickCell(page: Page, h3: string) {
  const [x, y] = await project(page, ...center(h3));
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).toHaveText(h3);
  // 시트에 가린 셀이면 지도가 옮겨 가므로(U10) 다 옮긴 뒤 다음 조작을 한다
  await page.waitForFunction(() => window.__mapDebug!.idle());
}

async function json<T>(page: Page, path: string): Promise<T> {
  return (await (await page.request.get(path)).json()) as T;
}

const sheet = (page: Page) => page.getByTestId('cell-sheet');

function nearestOf(items: Item[], from: [number, number]) {
  return items
    .map((i) => ({ i, d: distanceMeters(from, [i.lng, i.lat]) }))
    .reduce((a, b) => (b.d < a.d ? b : a));
}

for (const tag of ['', '@desktop ']) {
  test(`${tag}등급 셀을 누르면 시트에 배지·장소·기준·근거·출처·주변 시설·가까운 도움이 순서대로 나온다`, async ({
    page,
  }) => {
    const scores = (
      await json<{ cells: Record<string, [number | null, number]> }>(page, '/data/scores.json')
    ).cells;
    const emd = await json<EmdFile>(page, '/data/emd.json');
    const hall = latLngToCell(CITY_HALL[1], CITY_HALL[0], 8);
    const lv = levelFromPercentile(scores[hall][0])!;
    const from = center(hall);

    await openMap(page);
    await clickCell(page, hall);
    const s = sheet(page);
    await expect(s).toBeVisible();
    const place = placeLabel(placeAt(emd.items, from)!);
    await expect(s).toHaveRole('dialog');
    await expect(s).toHaveAccessibleName(place);

    // 1. 등급 배지(숫자와 이름)
    await expect(s.getByTestId('sheet-badge')).toHaveText(`${lv} · ${LEVEL_NAME[lv]}`);
    // 2. 장소 이름
    await expect(s.getByRole('heading', { name: place })).toBeVisible();
    // 3. 기준 문구
    await expect(s.getByTestId('sheet-basis')).toHaveText(
      '교통사고 도로 모델 · 날짜 무관 · 날씨 미반영',
    );
    // 4. 근거 문장
    const top = Math.max(1, Math.round(100 - scores[hall][0]!));
    await expect(s.getByTestId('sheet-reason')).toContainText(
      `도로가 있는 제주 격자 중 상위 ${top}% 안에 드는 곳이에요.`,
    );
    // 5. 출처 칩
    const chips = s.getByRole('list', { name: '출처' }).getByRole('listitem');
    await expect(chips.first()).toHaveText('교통사고 도로 모델(2017~2021 사고 자료)');
    await expect(chips.nth(1)).toHaveText('표준노드링크 2026-09-14');
    await expect(s.getByRole('list', { name: '출처' })).toContainText(
      '© OpenStreetMap contributors',
    );

    // 6. 주변 시설: 5종 × 300m·500m, 셀 중심에서 하버사인 거리로 센 값
    const table = s.getByRole('table', { name: /주변 시설/ });
    for (const [type, name] of TYPES) {
      const items = (await json<{ items: Item[] }>(page, `/data/poi/${type}.json`)).items;
      const ds = items.map((i) => distanceMeters(from, [i.lng, i.lat]));
      const r300 = ds.filter((d) => d <= 300).length;
      const r500 = ds.filter((d) => d <= 500).length;
      await expect(table.getByRole('row', { name: new RegExp(`^${name} `) })).toHaveText(
        `${name}${r300}${r500}`,
      );
    }

    // 7. 가까운 도움: 가장 가까운 119와 응급실 이름·직선거리
    const help = s.getByRole('region', { name: '가까운 도움' });
    const fire = nearestOf(
      (await json<{ items: Item[] }>(page, '/data/poi/fire.json')).items,
      from,
    );
    const er = nearestOf((await json<{ items: Item[] }>(page, '/data/poi/er.json')).items, from);
    await expect(help.getByTestId('help-fire')).toHaveText(
      `119안전센터${fire.i.name} ${formatDistance(fire.d)}`,
    );
    await expect(help.getByTestId('help-er')).toHaveText(
      `응급실${er.i.name} ${formatDistance(er.d)}`,
    );

    // 화면 순서: 배지 → 장소 → 기준 → 근거 → 출처 → 주변 시설 → 가까운 도움
    const ys = [];
    for (const l of [
      s.getByTestId('sheet-badge'),
      s.getByRole('heading', { name: place }),
      s.getByTestId('sheet-basis'),
      s.getByTestId('sheet-reason'),
      s.getByRole('list', { name: '출처' }),
      table,
      help,
    ]) {
      ys.push((await l.boundingBox())!.y);
    }
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });
}

test('데이터 부족 셀은 등급 대신 데이터 부족과 이유를 보인다', async ({ page }) => {
  const halla = latLngToCell(HALLA[1], HALLA[0], 8);
  await openMap(page);
  await clickCell(page, halla);
  const s = sheet(page);
  await expect(s.getByTestId('sheet-badge')).toHaveText('데이터 부족');
  await expect(s).toContainText('도로 자료 미확인');
  await expect(s.getByTestId('sheet-reason')).toHaveText(
    '이 셀은 도로 자료가 확인되지 않아 위험도를 계산하지 않았어요. 위험하지 않다는 뜻은 아니에요.',
  );
  await expect(s.getByRole('table', { name: /주변 시설/ })).toBeVisible();
  await expect(s.getByRole('region', { name: '가까운 도움' })).toBeVisible();
});

test('섬(수치지도) 셀은 수치지도로 계산했다고 말한다', async ({ page }) => {
  await openMap(page);
  await clickCell(page, UDO_CELL);
  const s = sheet(page);
  await expect(s.getByTestId('sheet-badge')).toHaveText('5 · 매우 높음');
  await expect(s.getByRole('heading', { name: '제주시 우도면' })).toBeVisible();
  await expect(s.getByTestId('sheet-reason')).toContainText('섬 지역 수치지도 도로로 계산했어요.');
  await expect(s.getByRole('list', { name: '출처' })).toContainText('수치지도 2025');
});

test('바다(격자 밖)를 누르면 위험도 정보가 없다는 시트와 가까운 도움이 나온다', async ({
  page,
}) => {
  const fire = (await json<{ items: Item[] }>(page, '/data/poi/fire.json')).items;
  await openMap(page);
  const [x, y] = await project(page, ...SEA);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).toHaveText('');
  const s = sheet(page);
  await expect(s).toBeVisible();
  await expect(s.getByRole('heading', { name: '이 위치는 위험도 정보가 없어요' })).toBeVisible();
  await expect(s.getByTestId('sheet-badge')).toHaveCount(0);
  await expect(s.getByRole('table', { name: /주변 시설/ })).toHaveCount(0);
  const near = nearestOf(fire, SEA);
  const help = s.getByRole('region', { name: '가까운 도움' });
  await expect(help.getByTestId('help-fire')).toContainText(near.i.name);
  await expect(help.getByTestId('help-er')).toBeVisible();
});

test('닫기 버튼과 Esc로 닫히고, 다른 셀을 누르면 닫히지 않고 내용이 바뀐다', async ({ page }) => {
  const hall = latLngToCell(CITY_HALL[1], CITY_HALL[0], 8);
  await openMap(page);
  await clickCell(page, hall);
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page)).toBeFocused();
  await sheet(page).getByRole('button', { name: '닫기' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('selected-cell')).toHaveText('');

  await clickCell(page, hall);
  await expect(sheet(page).getByTestId('sheet-badge')).toHaveText('5 · 매우 높음');
  await clickCell(page, UDO_CELL);
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole('heading', { name: '제주시 우도면' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('selected-cell')).toHaveText('');
});

test('시트를 연 채 날짜를 바꿔도 시트가 그대로 열려 있다', async ({ page }) => {
  const hall = latLngToCell(CITY_HALL[1], CITY_HALL[0], 8);
  await openMap(page);
  await clickCell(page, hall);
  const bar = page.getByTestId('date-bar');
  await bar.getByRole('button', { name: '날짜 선택' }).click();
  const cal = page.getByRole('dialog', { name: '날짜 선택' });
  await cal.getByRole('button', { name: '20, 10월 20일 (화)', exact: true }).click();
  await cal.getByRole('button', { name: '10월 20일 (화) 보기' }).click();
  await expect(cal).toBeHidden();
  await expect(bar.getByRole('button', { name: '10월 20일 (화)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByTestId('selected-cell')).toHaveText(hall);
  await expect(sheet(page).getByTestId('sheet-badge')).toHaveText('5 · 매우 높음');
  // 칩 '오늘'은 시트에 가리지 않아 바로 누를 수 있다
  await bar.getByRole('button', { name: '오늘' }).click();
  await expect(sheet(page)).toBeVisible();
});

test('셀을 고르기 전에는 시설 파일을 받지 않고, 시트를 열면 5종과 응급실을 받는다', async ({
  page,
}) => {
  const poi = new Set<string>();
  page.on('request', (r) => {
    const m = /\/data\/poi\/([a-z]+)\.json/.exec(r.url());
    if (m) poi.add(m[1]);
  });
  await openMap(page);
  await page.waitForTimeout(300);
  expect([...poi]).toEqual([]);
  await clickCell(page, latLngToCell(CITY_HALL[1], CITY_HALL[0], 8));
  await expect
    .poll(() => [...poi].sort())
    .toEqual(['cctv', 'convenience', 'er', 'fire', 'lodging', 'police']);
});

test('시설 카드와 셀 시트는 함께 보이지 않는다: 카드가 뜨면 시트를 숨기고 카드를 닫으면 같은 셀 시트가 다시 보인다', async ({
  page,
}) => {
  const hall = latLngToCell(CITY_HALL[1], CITY_HALL[0], 8);
  await openMap(page);
  await clickCell(page, hall);
  await expect(sheet(page)).toBeVisible();
  const sheetBox = (await sheet(page).boundingBox())!;

  await page.getByRole('button', { name: /^레이어/ }).click();
  await page.getByRole('switch', { name: '119안전센터' }).click();
  await page.getByRole('button', { name: /^레이어/ }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.__mapDebug!.markers())).length)
    .toBeGreaterThan(0);
  const list = await page.evaluate(() => window.__mapDebug!.markers());
  const vp = page.viewportSize()!;
  const lonely = list.filter(
    (i) =>
      i.kind === 'marker' &&
      i.x > 40 &&
      i.x < vp.width - 40 &&
      i.y > 160 &&
      i.y < sheetBox.y - 20 &&
      list.every((o) => o === i || Math.hypot(o.x - i.x, o.y - i.y) > 30),
  );
  // 범례·레이어 버튼 같은 지도 위 조작에 가린 마커는 고르지 않는다
  const onMap = await page.evaluate(
    (pts) =>
      pts.map(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('[data-testid="map"]'))),
    lonely.map((i) => [i.x, i.y] as [number, number]),
  );
  const m = lonely.find((_, k) => onMap[k])!;
  expect(m).toBeDefined();
  await page.mouse.click(m.x, m.y);
  const card = page.getByTestId('poi-card');
  await expect(card).toBeVisible();
  await expect(sheet(page)).toBeHidden();
  // 선택은 그대로라 카드에 셀 중심에서의 거리가 나온다
  await expectSelectionStays(page, hall);
  await expect(card.getByTestId('poi-distance')).toBeVisible();

  await card.getByRole('button', { name: '닫기' }).click();
  await expect(card).toBeHidden();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByTestId('sheet-badge')).toHaveText('5 · 매우 높음');
});

test('선택한 셀 위에 등급 숫자 태그(검정 바탕)를 그린다', async ({ page }) => {
  const hall = latLngToCell(CITY_HALL[1], CITY_HALL[0], 8);
  await openMap(page);
  await clickCell(page, hall);
  // 셀 꼭대기 꼭짓점 위 4px에 반지름 10px 원(cellCanvas TAG_GAP, TAG_RADIUS)
  const ring = cellToBoundary(hall, true) as [number, number][];
  let top = Infinity;
  for (const [lng, lat] of ring) top = Math.min(top, (await project(page, lng, lat))[1]);
  const [cx] = await project(page, ...center(hall));
  const cy = top - 4 - 10;
  const pixel = () =>
    page.evaluate(
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
        return [d[0], d[1], d[2], d[3]];
      },
      [cx - 7, cy] as const,
    );
  // 숫자 왼쪽 검정 바탕
  await expect.poll(async () => (await pixel())[3]).toBe(255);
  const [r, g, b] = await pixel();
  expect(Math.max(r, g, b)).toBeLessThan(40);
  // 시트를 닫으면 태그도 사라진다
  await sheet(page).getByRole('button', { name: '닫기' }).click();
  await expect.poll(async () => (await pixel())[3]).toBeLessThan(255);
});

test('모바일 시트는 화면의 45%까지 커져 처음 열 때 주변 시설 표 첫 줄이 보이고, 넘치면 아래에 흐려지는 더 보기 표시가 있다', async ({
  page,
}) => {
  await openMap(page);
  const hall = latLngToCell(CITY_HALL[1], CITY_HALL[0], 8);
  await clickCell(page, hall);
  const sheet = page.getByTestId('cell-sheet');
  await expect(sheet).toBeVisible();
  const first = sheet.locator('tbody tr').first();
  // 주변 시설 수가 다 들어온 뒤(… 아님)
  await expect(first.locator('td').first()).toHaveText(/^\d+$/);
  await expect(page.getByTestId('help-er')).not.toContainText('…');
  const vp = page.viewportSize()!;
  const s = (await sheet.boundingBox())!;
  expect(s.height).toBeLessThanOrEqual(vp.height * 0.45 + 1);
  expect(s.height).toBeGreaterThan(vp.height * 0.4);
  // 내용이 시트보다 길다(굴려야 보이는 것이 있다)
  const overflow = await sheet.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow).toBeGreaterThan(0);
  const more = page.getByTestId('sheet-more');
  await expect(more).toBeVisible();
  await expect(more).toContainText('더 보기');
  const m = (await more.boundingBox())!;
  // 흐려지는 표시는 시트 아래쪽에 붙어 있고, 표 첫 줄은 그 위에 다 보인다
  expect(Math.abs(m.y + m.height - (s.y + s.height))).toBeLessThan(4);
  const r = (await first.boundingBox())!;
  expect(r.y).toBeGreaterThanOrEqual(s.y);
  expect(r.y + r.height).toBeLessThanOrEqual(m.y);
  // 표시는 누르기를 가로채지 않는다
  await expect(more).toHaveCSS('pointer-events', 'none');
  // 끝까지 굴리면 표시가 사라진다
  await sheet.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(more).toBeHidden();
  await sheet.evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(more).toBeVisible();
});

test('@desktop 데스크톱 셀 패널에는 흐려지는 더 보기 표시를 두지 않는다', async ({ page }) => {
  await openMap(page);
  await clickCell(page, latLngToCell(CITY_HALL[1], CITY_HALL[0], 8));
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByTestId('help-er')).not.toContainText('…');
  await expect(page.getByTestId('sheet-more')).toBeHidden();
});
