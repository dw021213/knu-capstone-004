/// <reference path="../../src/types/global.d.ts" />
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { RISK_COLOR } from '../../src/entities/risk/colors';
import { levelFromPercentile } from '../../src/entities/risk/level';
import { test, expect } from './fixtures';

const AIRPORT: [number, number] = [126.493, 33.5113];

async function openMap(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__mapReady === true);
}

async function project(page: import('@playwright/test').Page, lng: number, lat: number) {
  return page.evaluate(([a, b]) => window.__mapDebug!.project(a, b), [lng, lat] as const);
}

test('제주공항을 누르면 그 셀이 선택된다', async ({ page }) => {
  await openMap(page);
  const [x, y] = await project(page, ...AIRPORT);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).toHaveText(
    latLngToCell(AIRPORT[1], AIRPORT[0], 8),
  );
});

test('격자 밖 바다를 누르면 선택이 비워진다', async ({ page }) => {
  await openMap(page);
  const [x, y] = await project(page, ...AIRPORT);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('selected-cell')).not.toHaveText('');
  const [sx, sy] = await project(page, 126.3, 33.7);
  await page.mouse.click(sx, sy);
  await expect(page.getByTestId('selected-cell')).toHaveText('');
});

test('첫 화면 셀 그리기가 1.5초 안에 끝난다', async ({ page }) => {
  await openMap(page);
  const t = await page.evaluate(() => performance.getEntriesByName('cells-drawn')[0]?.startTime);
  expect(t).toBeDefined();
  expect(t!).toBeLessThanOrEqual(1500);
});

const CENTER: [number, number] = [126.53, 33.38];
const zoomNow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__mapDebug!.zoom());
const drawCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => performance.getEntriesByName('cells-drawn').length);

async function mouseDrag(page: import('@playwright/test').Page, dx: number, dy: number) {
  const vp = page.viewportSize()!;
  const x = vp.width / 2;
  const y = vp.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(x + (dx * i) / 20, y + (dy * i) / 20);
  await page.mouse.up();
}

test('지도 영역은 브라우저 기본 터치 동작을 막는다', async ({ page }) => {
  await openMap(page);
  await expect(page.getByTestId('map')).toHaveCSS('touch-action', 'none');
});

test('@desktop 휠로 확대하면 줌이 커진다', async ({ page }) => {
  await openMap(page);
  const z0 = await zoomNow(page);
  const [x, y] = await project(page, ...AIRPORT);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -500);
  await expect.poll(() => zoomNow(page)).toBeGreaterThan(z0 + 0.5);
  // 휠은 포인터 아래 지점을 고정한다
  const [x2, y2] = await project(page, ...AIRPORT);
  expect(Math.abs(x2 - x)).toBeLessThan(2);
  expect(Math.abs(y2 - y)).toBeLessThan(2);
});

test('@desktop 크게 끌어도 제주 경계 밖으로 나가지 않는다', async ({ page }) => {
  await openMap(page);
  const vp = page.viewportSize()!;
  // 오른쪽으로 크게: 서쪽 경계(125.9)가 화면 왼쪽 끝에 멈춘다
  await mouseDrag(page, 3000, 0);
  const [wx] = await project(page, 125.9, CENTER[1]);
  expect(Math.abs(wx)).toBeLessThan(2);
  let [cx, cy] = await project(page, ...CENTER);
  expect(cx).toBeGreaterThan(0);
  expect(cx).toBeLessThan(vp.width);
  expect(cy).toBeGreaterThan(0);
  expect(cy).toBeLessThan(vp.height);
  // 왼쪽 위로 크게: 동쪽(127.2)·남쪽(32.9) 경계가 화면 끝에 멈춘다
  await mouseDrag(page, -6000, -3000);
  const [ex, sy] = await project(page, 127.2, 32.9);
  expect(Math.abs(ex - vp.width)).toBeLessThan(2);
  expect(Math.abs(sy - vp.height)).toBeLessThan(2);
  [cx, cy] = await project(page, ...CENTER);
  expect(cx).toBeGreaterThan(0);
  expect(cx).toBeLessThan(vp.width);
  expect(cy).toBeGreaterThan(0);
  expect(cy).toBeLessThan(vp.height);
  // 끌기는 셀 선택이 아니다
  await expect(page.getByTestId('selected-cell')).toHaveText('');
});

test('핀치로 확대되고 한 손가락으로 끌면 이동한다', async ({ page }) => {
  await openMap(page);
  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize()!;
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const z0 = await zoomNow(page);

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: cx - 30, y: cy, id: 0 },
      { x: cx + 30, y: cy, id: 1 },
    ],
  });
  for (let i = 1; i <= 10; i++) {
    const d = 30 + i * 10;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: cx - d, y: cy, id: 0 },
        { x: cx + d, y: cy, id: 1 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => zoomNow(page)).toBeGreaterThan(z0 + 1);

  const before = await project(page, ...CENTER);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: cx, y: cy, id: 0 }],
  });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx - i * 8, y: cy - i * 5, id: 0 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await project(page, ...CENTER))[0]).toBeLessThan(before[0] - 60);
  const after = await project(page, ...CENTER);
  expect(after[1]).toBeLessThan(before[1] - 30);
  await expect(page.getByTestId('selected-cell')).toHaveText('');
});

/** canvas에서 화면 점 (x, y) 둘레 한 변 2r+1 CSS px 정사각형의 RGBA 픽셀 */
async function canvasPixels(page: import('@playwright/test').Page, x: number, y: number, r = 0) {
  return page.evaluate(
    ([px, py, rr]) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="map"] canvas')!;
      const rect = c.getBoundingClientRect();
      const dpr = c.width / rect.width;
      const ctx = c.getContext('2d')!;
      const out: number[][] = [];
      for (let dy = -rr; dy <= rr; dy++) {
        for (let dx = -rr; dx <= rr; dx++) {
          const d = ctx.getImageData(
            Math.round((px + dx - rect.left) * dpr),
            Math.round((py + dy - rect.top) * dpr),
            1,
            1,
          ).data;
          out.push([d[0], d[1], d[2], d[3]]);
        }
      }
      return out;
    },
    [x, y, r] as const,
  );
}

test('@desktop 데이터 부족 셀은 회색 빗금, 등급 셀은 램프 색 0.5로 칠한다', async ({ page }) => {
  const cells = (await (await page.request.get('/data/scores.json')).json()).cells as Record<
    string,
    [number | null, number]
  >;
  const airport = latLngToCell(AIRPORT[1], AIRPORT[0], 8);
  const near = gridDisk(airport, 3).filter((h) => cells[h]);
  const noData = near.find((h) => cells[h][0] === null)!;
  const graded = near.find((h) => cells[h][0] !== null)!;
  expect(noData).toBeDefined();
  expect(graded).toBeDefined();

  await openMap(page);
  // 셀이 충분히 크게 보이도록 공항에서 확대하고 다시 그려질 때까지 기다린다
  const n0 = await drawCount(page);
  const [ax, ay] = await project(page, ...AIRPORT);
  await page.mouse.move(ax, ay);
  await page.mouse.wheel(0, -1000);
  await expect.poll(() => zoomNow(page)).toBeGreaterThan(12.5);
  await expect.poll(() => drawCount(page)).toBeGreaterThan(n0);

  const center = async (h: string) => {
    const [lat, lng] = cellToLatLng(h);
    return project(page, lng, lat);
  };

  // 데이터 부족: 모든 픽셀이 무채색 회색이고, 빗금이라 밝기가 섞여 있다
  const [nx, ny] = await center(noData);
  const grey = await canvasPixels(page, nx, ny, 5);
  for (const [r, g, b, a] of grey) {
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(10);
    expect(a).toBeGreaterThan(100);
    expect(r).toBeLessThan(230);
  }
  const shades = new Set(grey.map(([r, , , a]) => `${r}/${a}`));
  expect(shades.size).toBeGreaterThan(1);

  // 등급 셀: 램프 색, 불투명도 0.5
  const lv = levelFromPercentile(cells[graded][0])!;
  const hex = RISK_COLOR[lv];
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [gx, gy] = await center(graded);
  const [[r, g, b, a]] = await canvasPixels(page, gx, gy);
  expect(Math.abs(a - 128)).toBeLessThanOrEqual(3);
  expect(Math.abs(r - want[0])).toBeLessThanOrEqual(3);
  expect(Math.abs(g - want[1])).toBeLessThanOrEqual(3);
  expect(Math.abs(b - want[2])).toBeLessThanOrEqual(3);
  // 흰 바탕에 섞으면 램프 색과 흰색의 중간
  const mixed = [r, g, b].map((c) => (c * a) / 255 + 255 * (1 - a / 255));
  mixed.forEach((c, i) => expect(Math.abs(c - (want[i] * 0.5 + 127.5))).toBeLessThanOrEqual(4));
});

test('지도 오른쪽 아래에 배경 지도 출처를 표기한다', async ({ page }) => {
  await openMap(page);
  const credit = page.getByRole('link', { name: '© OpenStreetMap contributors' });
  await expect(credit).toBeVisible();
  await expect(credit).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  const box = (await credit.boundingBox())!;
  const map = (await page.getByTestId('map').boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(map.x + map.width - 24);
  expect(box.y + box.height).toBeGreaterThan(map.y + map.height - 24);
});

test('6px 넘게 끌면 선택이 바뀌지 않고, 조금 흔들린 누르기는 선택된다', async ({ page }) => {
  const cells = (await (await page.request.get('/data/scores.json')).json()).cells as Record<
    string,
    [number | null, number]
  >;
  const airport = latLngToCell(AIRPORT[1], AIRPORT[0], 8);
  const graded = gridDisk(airport, 3).find(
    (h) => h !== airport && cells[h]?.[0] != null && gridDisk(airport, 2).indexOf(h) < 0,
  )!;
  expect(graded).toBeDefined();
  await openMap(page);
  // 셀이 크게 보이도록 공항에서 두 번 누르기로 세 번 확대
  for (let i = 0; i < 3; i++) {
    const z = await zoomNow(page);
    const [x, y] = await project(page, ...AIRPORT);
    await page.mouse.dblclick(x, y);
    await expect.poll(() => zoomNow(page)).toBeGreaterThan(z + 0.9);
  }
  const [ax, ay] = await project(page, ...AIRPORT);
  await page.mouse.click(ax, ay);
  await expect(page.getByTestId('selected-cell')).toHaveText(airport);

  const gradedCenter = () => {
    const [lat, lng] = cellToLatLng(graded);
    return project(page, lng, lat);
  };
  // 등급 셀 위에서 눌러 20px 끌기: 선택은 공항 셀 그대로
  let [gx, gy] = await gradedCenter();
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(gx + i * 4, gy);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('selected-cell')).toHaveText(airport);

  // 2px 흔들린 누르기: 그 셀이 선택된다
  [gx, gy] = await gradedCenter();
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 2, gy + 1);
  await page.mouse.up();
  await expect(page.getByTestId('selected-cell')).toHaveText(graded);
});
