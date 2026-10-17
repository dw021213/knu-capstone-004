// 제주 읍면동(행정동) 경계 GeoJSON → public/data/emd.json (이름, 대표점, 경계 상자, 줄인 외곽선)
// 실행: npm run data:emd  (원본: data-src/emd/jeju-emd.geojson)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SOURCE =
  '통계청 SGIS 행정동 경계(공공누리 제1유형)를 vuski/admdongkor가 가공한 2021-04 판(raqoon886/Local_HangJeongDong 제주 파일)';
export const LICENSE = 'CC BY 4.0(vuski/admdongkor 가공물), 공공누리 제1유형 출처표시(SGIS 원자료)';

/** 줄이기 허용 오차(도). 약 30m */
const TOLERANCE = 0.0003;
/** 좌표 자릿수(소수 넷째 자리, 약 10m) */
const round = (v) => Math.round(v * 1e4) / 1e4;

/** 점 [lng, lat]이 고리 안에 있는지(짝홀 규칙, 감김 방향과 무관) */
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function douglasPeucker(points, tol) {
  if (points.length <= 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let far = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i], first, last);
    if (d > far) {
      far = d;
      index = i;
    }
  }
  if (far <= tol) return [first, last];
  const left = douglasPeucker(points.slice(0, index + 1), tol);
  const right = douglasPeucker(points.slice(index), tol);
  return [...left.slice(0, -1), ...right];
}

/** 닫힌 고리를 더글러스-포이커로 줄인다(처음 = 끝 유지) */
export function simplifyRing(ring, tol = TOLERANCE) {
  return douglasPeucker(ring, tol);
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

/** 고리 안에서 가장자리와 가장 먼 격자점(볼록하지 않은 모양·여러 조각에서도 안쪽에 놓인다) */
function innerPoint(ring) {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const STEPS = 40;
  let best = null;
  let bestD = -1;
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; j < STEPS; j++) {
      const p = [w + ((e - w) * i) / STEPS, s + ((n - s) * j) / STEPS];
      if (!pointInRing(p, ring)) continue;
      let d = Infinity;
      for (let k = 1; k < ring.length; k++)
        d = Math.min(d, segmentDistance(p, ring[k - 1], ring[k]));
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

export function buildEmd(geojson) {
  const items = geojson.features.map((f) => {
    const p = f.properties;
    const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const polygons = parts
      .map((poly) => simplifyRing(poly[0]).map(([lng, lat]) => [round(lng), round(lat)]))
      .filter((ring) => ring.length >= 4);
    const largest = polygons.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
    const [cx, cy] = innerPoint(largest);
    const all = polygons.flat();
    const lngs = all.map((c) => c[0]);
    const lats = all.map((c) => c[1]);
    const name = p.adm_nm.split(' ').at(-1);
    return {
      code: p.adm_cd2,
      name,
      sgg: p.sggnm,
      center: [round(cx), round(cy)],
      bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      polygons,
    };
  });
  items.sort((a, b) => a.code.localeCompare(b.code));
  return { source: SOURCE, license: LICENSE, items };
}

export function serializeEmd(emd) {
  return `${JSON.stringify(emd)}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('../', import.meta.url);
  const src = process.argv[2] ?? new URL('data-src/emd/jeju-emd.geojson', root);
  const emd = buildEmd(JSON.parse(readFileSync(src, 'utf8')));
  writeFileSync(new URL('public/data/emd.json', root), serializeEmd(emd));
  console.log(`읍면동 ${emd.items.length}곳 → public/data/emd.json`);
}
