/// <reference path="../../src/types/global.d.ts" />
import { cellToLatLng, latLngToCell } from 'h3-js';
import { distanceMeters, formatDistance } from '../../src/shared/geo/distance';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const ROWS = [
  { name: 'CCTV', desc: '방범·교통 카메라', source: '행정안전부, 2020년 기준 일부' },
  { name: '편의점', desc: '밤늦게 도움 요청', source: '소상공인시장진흥공단, 2026년 6월' },
  { name: '숙박', desc: '호텔·모텔', source: '소상공인시장진흥공단, 2026년 6월' },
  { name: '경찰', desc: '지구대·파출소', source: '경찰청, 2025년 12월 기준' },
  { name: '119안전센터', desc: '화재·구급 출동', source: '소방청' },
];

async function openMap(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

const layerButton = (page: Page) => page.getByRole('button', { name: /^레이어/ });
const panel = (page: Page) => page.getByRole('region', { name: '시설 레이어' });
const sw = (page: Page, name: string) => panel(page).getByRole('switch', { name });

for (const tag of ['', '@desktop ']) {
  test(`${tag}레이어 버튼은 지도 좌상단에 있고 누르면 5개 토글이 모두 꺼진 채 열린다`, async ({
    page,
  }) => {
    await openMap(page);
    const btn = layerButton(page);
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(panel(page)).toBeHidden();
    // 좌상단, 상단 '종합' 영역 아래
    const box = (await btn.boundingBox())!;
    const top = (await page.getByTestId('risk-tabs').boundingBox())!;
    expect(box.x).toBeLessThan(24);
    expect(box.y).toBeGreaterThanOrEqual(top.y + top.height);
    expect(box.y).toBeLessThan(140);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    // 켠 것이 없으면 배지가 없다
    await expect(page.getByTestId('layer-badge')).toHaveCount(0);

    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const controls = await btn.getAttribute('aria-controls');
    await expect(page.locator(`#${controls}`)).toBeVisible();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('switch')).toHaveCount(5);
    for (const row of ROWS) {
      const s = sw(page, row.name);
      await expect(s).toHaveAttribute('aria-checked', 'false');
      await expect(s).toBeEnabled();
      await expect(s).toContainText(row.desc);
      await expect(s).toContainText(row.source);
      const b = (await s.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    // 다시 누르면 닫힌다
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(panel(page)).toBeHidden();
  });
}

test('토글을 켜면 검정으로 채워지고 버튼에 켠 개수 배지가 붙는다', async ({ page }) => {
  await openMap(page);
  await layerButton(page).click();
  await sw(page, 'CCTV').click();
  await expect(sw(page, 'CCTV')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('layer-badge')).toHaveText('1');
  await sw(page, '119안전센터').click();
  await expect(page.getByTestId('layer-badge')).toHaveText('2');
  await expect(layerButton(page)).toHaveAccessibleName('레이어 2개 켜짐');
  // 켜진 토글은 검정 채움(ink), 꺼진 토글은 흰 바탕
  const ink = 'rgb(17, 17, 17)';
  await expect(sw(page, 'CCTV').getByTestId('switch-track')).toHaveCSS('background-color', ink);
  await expect(sw(page, '편의점').getByTestId('switch-track')).not.toHaveCSS(
    'background-color',
    ink,
  );
  await sw(page, 'CCTV').click();
  await expect(sw(page, 'CCTV')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('layer-badge')).toHaveText('1');
});

test('키보드로 열고, 토글하고, Esc로 닫으면 포커스가 버튼으로 돌아온다', async ({ page }) => {
  await openMap(page);
  await layerButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(sw(page, 'CCTV')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(sw(page, 'CCTV')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab');
  await expect(sw(page, '편의점')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(layerButton(page)).toBeFocused();
  await expect(page.getByTestId('layer-badge')).toHaveText('1');
});

test('켜기 전에는 시설 파일을 받지 않고, 켠 종류만 처음 켤 때 받는다', async ({ page }) => {
  const poi: string[] = [];
  page.on('request', (r) => {
    const m = /\/data\/poi\/([a-z]+)\.json/.exec(r.url());
    if (m) poi.push(m[1]);
  });
  await openMap(page);
  await layerButton(page).click();
  await expect(panel(page)).toBeVisible();
  await page.waitForTimeout(300);
  expect(poi).toEqual([]);
  const res = page.waitForResponse('**/data/poi/fire.json');
  await sw(page, '119안전센터').click();
  await res;
  // 껐다 다시 켜도 다시 받지 않는다
  await sw(page, '119안전센터').click();
  await sw(page, '119안전센터').click();
  await page.waitForTimeout(300);
  expect(poi).toEqual(['fire']);
});

test("자료가 'pending'인 종류는 켜면 '준비 중'으로 비활성되고 배지에 세지 않는다", async ({
  page,
}) => {
  await page.route('**/data/poi/police.json', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'police',
        status: 'pending',
        source: '로그인이 필요해 내려받지 못함',
        items: [],
      }),
    }),
  );
  await openMap(page);
  await layerButton(page).click();
  await sw(page, '경찰').click();
  await expect(sw(page, '경찰')).toBeDisabled();
  await expect(sw(page, '경찰')).toHaveAttribute('aria-checked', 'false');
  await expect(sw(page, '경찰')).toContainText('준비 중');
  await expect(page.getByTestId('layer-badge')).toHaveCount(0);
  // 다른 종류는 그대로 켤 수 있다
  await sw(page, 'CCTV').click();
  await expect(page.getByTestId('layer-badge')).toHaveText('1');
});

// ── 지도 위 마커·클러스터 ──

type Drawn = {
  kind: 'cluster' | 'marker';
  group: string;
  x: number;
  y: number;
  id?: string;
  count?: number;
  label?: string;
  box: [number, number, number, number];
};
const CITY_HALL: [number, number] = [126.5312, 33.4996];
const drawn = (page: Page) => page.evaluate(() => window.__mapDebug!.markers() as Drawn[]);
const zoomNow = (page: Page) => page.evaluate(() => window.__mapDebug!.zoom());
const project = (page: Page, lng: number, lat: number) =>
  page.evaluate(([a, b]) => window.__mapDebug!.project(a, b), [lng, lat] as const);

async function turnOn(page: Page, ...names: string[]) {
  await layerButton(page).click();
  for (const n of names) {
    await sw(page, n).click();
    await expect(sw(page, n)).toHaveAttribute('aria-checked', 'true');
  }
  // 패널을 닫아 지도를 가리지 않게
  await layerButton(page).click();
  await expect(panel(page)).toBeHidden();
}

/** 레이어를 켜기 전에 [lng, lat]에서 두 번 누르기로 z 이상까지 확대 */
async function zoomInAt(page: Page, at: [number, number], z: number) {
  while ((await zoomNow(page)) < z) {
    const z0 = await zoomNow(page);
    const [x, y] = await project(page, ...at);
    await page.mouse.dblclick(x, y);
    await expect.poll(() => zoomNow(page)).toBeGreaterThan(z0 + 0.9);
  }
  await page.waitForTimeout(400);
}

/** 마커 canvas의 화면 점 (x, y) 픽셀 RGBA */
async function markerPixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="marker-canvas"]')!;
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
    [x, y] as const,
  );
}

for (const tag of ['', '@desktop ']) {
  test(`${tag}낮은 줌에서 CCTV를 켜면 CCTV 숫자 클러스터가 생기고 합이 전체 수와 같다`, async ({
    page,
  }) => {
    const cctv = (await (await page.request.get('/data/poi/cctv.json')).json()).items as {
      lng: number;
      lat: number;
    }[];
    await openMap(page);
    expect(await zoomNow(page)).toBeLessThan(13);
    // 전제: 첫 화면에 모든 CCTV가 들어온다
    const vp = page.viewportSize()!;
    const pts = await page.evaluate(
      (ps) => ps.map((p) => window.__mapDebug!.project(p.lng, p.lat)),
      cctv,
    );
    expect(pts.every(([x, y]) => x > 0 && x < vp.width && y > 0 && y < vp.height)).toBe(true);
    expect(await drawn(page)).toEqual([]);

    await turnOn(page, 'CCTV');
    await expect.poll(async () => (await drawn(page)).length).toBeGreaterThan(0);
    const items = await drawn(page);
    expect(items.every((i) => i.group === 'cctv')).toBe(true);
    const clusters = items.filter((i) => i.kind === 'cluster');
    expect(clusters.length).toBeGreaterThan(3);
    for (const c of clusters) {
      expect(c.label).toBe('CCTV');
      expect(c.count).toBeGreaterThan(1);
    }
    const sum = items.reduce((s, i) => s + (i.kind === 'cluster' ? i.count! : 1), 0);
    expect(sum).toBe(cctv.length);
    // 실제로 그렸다: 가장 큰 알약 왼쪽 안쪽은 검정 채움
    const big = clusters.reduce((a, b) => (a.count! > b.count! ? a : b));
    const [r, g, b, a] = await markerPixel(page, big.box[0] + 5, big.y);
    expect(Math.max(r, g, b)).toBeLessThan(40);
    expect(a).toBeGreaterThan(200);

    // 끄면 사라진다
    await layerButton(page).click();
    await sw(page, 'CCTV').click();
    await expect.poll(async () => (await drawn(page)).length).toBe(0);
    expect((await markerPixel(page, big.box[0] + 5, big.y))[3]).toBe(0);
  });
}

test('두 종류를 켜면 종류별로 따로 묶이고, 하나를 끄면 그 종류만 사라진다', async ({ page }) => {
  await openMap(page);
  await turnOn(page, 'CCTV', '편의점');
  await expect.poll(async () => new Set((await drawn(page)).map((i) => i.group)).size).toBe(2);
  const labels = new Set((await drawn(page)).filter((i) => i.label).map((i) => i.label));
  expect(labels).toEqual(new Set(['CCTV', '편의점']));
  await layerButton(page).click();
  await sw(page, 'CCTV').click();
  await expect
    .poll(async () => [...new Set((await drawn(page)).map((i) => i.group))])
    .toEqual(['convenience']);
});

test('줌 13 이상으로 확대하면 개별 마커로 풀린다', async ({ page }) => {
  await openMap(page);
  await zoomInAt(page, CITY_HALL, 13);
  await turnOn(page, 'CCTV');
  await expect.poll(async () => (await drawn(page)).length).toBeGreaterThan(0);
  const items = await drawn(page);
  expect(items.every((i) => i.kind === 'marker' && i.group === 'cctv' && i.id)).toBe(true);
  // 화면 밖은 그리지 않는다
  const vp = page.viewportSize()!;
  for (const i of items) {
    expect(i.x).toBeGreaterThan(-40);
    expect(i.x).toBeLessThan(vp.width + 40);
  }
  // 마커 가운데는 검정 채움
  const m = items.find((i) => i.x > 20 && i.x < vp.width - 20 && i.y > 120 && i.y < 600)!;
  const [r, g, b, a] = await markerPixel(page, m.x, m.y);
  expect(Math.max(r, g, b)).toBeLessThan(40);
  expect(a).toBeGreaterThan(200);
});

test('클러스터를 누르면 그 위치로 2배 확대되고 셀 선택은 바뀌지 않는다', async ({ page }) => {
  await openMap(page);
  await turnOn(page, 'CCTV');
  await expect.poll(async () => (await drawn(page)).length).toBeGreaterThan(0);
  const z0 = await zoomNow(page);
  const vp = page.viewportSize()!;
  const c = (await drawn(page))
    .filter((i) => i.kind === 'cluster' && i.y > 150 && i.y < vp.height - 150)
    .reduce((a, b) => (a.count! > b.count! ? a : b));
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => zoomNow(page)).toBeCloseTo(z0 + 1, 1);
  await expect(page.getByTestId('selected-cell')).toHaveText('');
  // 누른 묶음 자리를 기준으로 확대해 그 자리에 다시 CCTV가 그려진다
  await page.waitForTimeout(400);
  const after = await drawn(page);
  const near = after.filter((i) => Math.hypot(i.x - c.x, i.y - c.y) < 80);
  expect(near.length).toBeGreaterThan(0);
});

// ── 시설 카드 ──

type Item = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  detail?: Record<string, unknown>;
};
const card = (page: Page) => page.getByTestId('poi-card');

async function items(page: Page, type: string) {
  return (await (await page.request.get(`/data/poi/${type}.json`)).json()).items as Item[];
}

/** 이웃과 떨어져 있어 눌러도 헷갈리지 않는 마커 */
function lonelyMarker(list: Drawn[], vp: { width: number; height: number }, group: string) {
  return list.find(
    (m) =>
      m.kind === 'marker' &&
      m.group === group &&
      m.x > 40 &&
      m.x < vp.width - 40 &&
      m.y > 160 &&
      m.y < vp.height - 200 &&
      list.every((o) => o === m || Math.hypot(o.x - m.x, o.y - m.y) > 30),
  );
}

test('셀을 고르지 않고 119 마커를 누르면 카드에 이름·종류·출처가 있고 거리는 없다', async ({
  page,
}) => {
  const fire = await items(page, 'fire');
  await openMap(page);
  await turnOn(page, '119안전센터');
  await expect.poll(async () => (await drawn(page)).length).toBeGreaterThan(0);
  const vp = page.viewportSize()!;
  const m = lonelyMarker(await drawn(page), vp, 'fire');
  expect(m).toBeDefined();
  await page.mouse.click(m!.x, m!.y);
  const c = card(page);
  await expect(c).toBeVisible();
  await expect(c).toHaveRole('dialog');
  const poi = fire.find((f) => f.id === m!.id)!;
  await expect(c.getByRole('heading', { name: poi.name })).toBeVisible();
  await expect(c).toContainText('119안전센터');
  await expect(c).toContainText('소방청 119안전센터 목록');
  // 좌표를 OpenStreetMap Nominatim에서 얻은 종류는 OSM 표기를 함께 한다
  await expect(c).toContainText('© OpenStreetMap contributors');
  await expect(c.getByText('거리')).toHaveCount(0);
  // 마커 누르기는 셀 선택이 아니다
  await expect(page.getByTestId('selected-cell')).toHaveText('');
  // 닫기
  await c.getByRole('button', { name: '닫기' }).click();
  await expect(c).toBeHidden();
});

for (const tag of ['', '@desktop ']) {
  test(`${tag}셀을 고른 뒤 CCTV 마커를 누르면 목적·대수와 셀 중심에서의 거리가 보인다`, async ({
    page,
  }) => {
    const cctv = await items(page, 'cctv');
    await openMap(page);
    await zoomInAt(page, CITY_HALL, 13);
    // 시청 셀을 고른다(셀 중심을 눌러 경계 흔들림을 피한다)
    const hall = latLngToCell(CITY_HALL[1], CITY_HALL[0], 8);
    const [clat, clng] = cellToLatLng(hall);
    const [hx, hy] = await project(page, clng, clat);
    await page.mouse.click(hx, hy);
    await expect(page.getByTestId('selected-cell')).toHaveText(hall);

    await turnOn(page, 'CCTV');
    await expect.poll(async () => (await drawn(page)).length).toBeGreaterThan(0);
    const vp = page.viewportSize()!;
    const m = lonelyMarker(await drawn(page), vp, 'cctv');
    expect(m).toBeDefined();
    await page.mouse.click(m!.x, m!.y);
    const c = card(page);
    await expect(c).toBeVisible();
    const poi = cctv.find((i) => i.id === m!.id)!;
    await expect(c.getByRole('heading', { name: poi.name })).toBeVisible();
    await expect(c).toContainText('CCTV');
    await expect(c).toContainText(`목적${poi.detail!.purpose}`);
    await expect(c).toContainText(`카메라${poi.detail!.cameras}대`);
    await expect(c).toContainText('행정안전부 전국CCTV표준데이터');
    const want = formatDistance(distanceMeters([clng, clat], [poi.lng, poi.lat]));
    await expect(c.getByTestId('poi-distance')).toHaveText(`선택한 셀 중심에서 ${want}`);
    // 셀 선택은 그대로, 누른 마커는 크게 그린다
    await expect(page.getByTestId('selected-cell')).toHaveText(hall);
    // Esc로 닫는다
    await c.focus();
    await page.keyboard.press('Escape');
    await expect(c).toBeHidden();
  });
}

test('카드를 연 채 레이어를 끄거나 지도를 누르면 카드가 닫힌다', async ({ page }) => {
  await openMap(page);
  await turnOn(page, '119안전센터');
  await expect.poll(async () => (await drawn(page)).length).toBeGreaterThan(0);
  const vp = page.viewportSize()!;
  const m = lonelyMarker(await drawn(page), vp, 'fire')!;
  await page.mouse.click(m.x, m.y);
  await expect(card(page)).toBeVisible();
  await layerButton(page).click();
  await sw(page, '119안전센터').click();
  await expect(card(page)).toBeHidden();
  // 다시 켜고 열어 둔 뒤 지도 빈 곳(바다)을 누르면 닫힌다
  await sw(page, '119안전센터').click();
  await layerButton(page).click();
  await expect.poll(async () => (await drawn(page)).length).toBeGreaterThan(0);
  await page.mouse.click(m.x, m.y);
  await expect(card(page)).toBeVisible();
  const [sx, sy] = await project(page, 126.3, 33.7);
  await page.mouse.click(sx, sy);
  await expect(card(page)).toBeHidden();
});

// ── 기억 ──

test('켠 레이어는 새로고침 뒤에도 켜져 있고 지도에 다시 그려진다', async ({ page }) => {
  await openMap(page);
  await turnOn(page, 'CCTV', '숙박');
  await page.reload();
  await page.waitForFunction(() => window.__mapReady === true);
  await expect(page.getByTestId('layer-badge')).toHaveText('2');
  await expect
    .poll(async () => [...new Set((await drawn(page)).map((i) => i.group))].sort())
    .toEqual(['cctv', 'lodging']);
  await layerButton(page).click();
  await expect(sw(page, 'CCTV')).toHaveAttribute('aria-checked', 'true');
  await expect(sw(page, '숙박')).toHaveAttribute('aria-checked', 'true');
  await expect(sw(page, '편의점')).toHaveAttribute('aria-checked', 'false');
});

test('localStorage를 쓸 수 없어도 레이어를 켜고 끌 수 있다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('막힘', 'SecurityError');
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openMap(page);
  await turnOn(page, '편의점');
  await expect(page.getByTestId('layer-badge')).toHaveText('1');
  await expect.poll(async () => (await drawn(page)).length).toBeGreaterThan(0);
  await layerButton(page).click();
  await sw(page, '편의점').click();
  await expect(page.getByTestId('layer-badge')).toHaveCount(0);
  // 기억은 못 하므로 새로고침하면 모두 꺼진 처음 상태
  await page.reload();
  await page.waitForFunction(() => window.__mapReady === true);
  await expect(page.getByTestId('layer-badge')).toHaveCount(0);
  expect(errors).toEqual([]);
});
