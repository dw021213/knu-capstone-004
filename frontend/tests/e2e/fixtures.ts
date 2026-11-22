/// <reference path="../../src/types/global.d.ts" />
import { test as base, expect, type Page } from '@playwright/test';
import { TAP_DELAY } from '../../src/features/map/gesture';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

// 외부 서비스에 기대지 않는다. e2e 빌드에는 가짜 카카오 키가 들어가지만 SDK는 막혀 읍면동 검색만 쓰고
// (카카오 결과가 필요한 테스트는 fakeKakao로 덮어쓴다), OSRM은 막혀 바로 직선 연결이 된다
// (도로 경로가 필요한 테스트는 page.route로 덮어쓴다)
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/tile.openstreetmap.org/**', (r) =>
      r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
    );
    await page.route('**/dapi.kakao.com/**', (r) => r.abort());
    await page.route('**/router.project-osrm.org/**', (r) => r.abort());
    await use(page);
  },
});
export { expect };

/**
 * 누른 뒤 셀 선택이 바뀌지 않았는지 본다. 지도는 한 번 누르기를 TAP_DELAY만큼 기다렸다가 고르므로,
 * 바로 확인하면 새어 나간 선택을 놓친다. 그 시간이 지난 뒤 확인한다
 */
export async function expectSelectionStays(page: Page, value: string) {
  await page.waitForTimeout(TAP_DELAY + 150);
  await expect(page.getByTestId('selected-cell')).toHaveText(value);
}

/** 카카오 키워드 검색 응답 문서(쓰는 필드만) */
export interface FakeKakaoDoc {
  id: string;
  place_name: string;
  category_name: string;
  road_address_name: string;
  address_name: string;
  x: string;
  y: string;
}

/**
 * 카카오 지도 SDK 대신 이름에 검색어가 들고 bounds 안인 문서를 쪽(page, size)으로 잘라 주는 가짜를 싣는다.
 * 받은 요청은 window.__kakaoCalls에 남긴다
 */
export async function fakeKakao(page: Page, docs: FakeKakaoDoc[]) {
  const body = `(() => {
    const all = ${JSON.stringify(docs)};
    function Places() {}
    Places.prototype.keywordSearch = function (q, cb, opts) {
      const size = opts.size || 15;
      const page = opts.page || 1;
      const b = opts.bounds;
      const inside = (d) =>
        !b || (+d.y >= b.sw.lat && +d.y <= b.ne.lat && +d.x >= b.sw.lng && +d.x <= b.ne.lng);
      const hits = all.filter((d) => d.place_name.includes(q.trim()) && inside(d));
      const docs = hits.slice((page - 1) * size, page * size);
      (window.__kakaoCalls = window.__kakaoCalls || []).push({ q, page, size, bounds: !!opts.bounds });
      setTimeout(() => cb(docs, docs.length ? 'OK' : 'ZERO_RESULT', { totalCount: hits.length }), 20);
    };
    window.kakao = { maps: {
      load: (f) => f(),
      LatLng: function (lat, lng) { this.lat = lat; this.lng = lng; },
      LatLngBounds: function (sw, ne) { this.sw = sw; this.ne = ne; },
      services: { Places, Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' } },
    } };
  })();`;
  await page.route('**/dapi.kakao.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body }),
  );
}
