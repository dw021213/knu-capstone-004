/// <reference path="../../src/types/global.d.ts" />
import { cellToLatLng, latLngToCell } from 'h3-js';
import { distanceMeters, formatDistance } from '../../src/shared/geo/distance';
import { placeAt, placeLabel, type EmdFile } from '../../src/entities/place/emd';
import { LEVEL_NAME, levelFromPercentile } from '../../src/entities/risk/level';
import { test, expect } from './fixtures';
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
