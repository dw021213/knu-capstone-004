// data-src/poi/의 커밋된 원본 → public/data/poi/<kind>.json
// 네트워크를 쓰지 않는다. 원본을 새로 받는 일은 scripts/fetch-poi.mjs가 한다.
// 실행: npm run data:poi (= node scripts/build-poi.mjs data-src/poi)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** src/features/map/projection.ts의 JEJU_BOUNDS와 같아야 한다(테스트로 확인) */
export const BOUNDS = { west: 125.9, east: 127.2, south: 32.9, north: 34.05 };

/** 화면 레이어 5종 + 셀 시트 '가까운 도움'용 응급실 */
export const POI_KINDS = ['cctv', 'convenience', 'lodging', 'police', 'fire', 'er'];

export const SOURCES_URL = new URL('./poi-sources.json', import.meta.url);

/** RFC 4180 CSV. 빈 줄은 건너뛴다 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** 첫 줄을 헤더로 객체 배열을 만든다(BOM 제거) */
export function csvObjects(text) {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ''));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** 지오코딩 질의용 주소 정리: 괄호, 겹친 공백, 연속으로 반복된 낱말, 끝의 기관명 */
export function normalizeAddress(address) {
  const words = address
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w, i, all) => w !== all[i - 1]);
  while (words.length > 1 && /(파출소|지구대|경찰서|센터)$/.test(words.at(-1))) words.pop();
  return words.join(' ');
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

/** 숫자 좌표를 만들고 제주 경계 밖이면 null */
function toPoint(latText, lngText) {
  if (latText === '' || lngText === '' || latText == null || lngText == null) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < BOUNDS.south || lat > BOUNDS.north || lng < BOUNDS.west || lng > BOUNDS.east) {
    return null;
  }
  return { lat: round6(lat), lng: round6(lng) };
}

const stripSido = (s) => s.replace(/^제주특별자치도\s*/, '').trim();
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 전국CCTV표준데이터(제주 행) → CCTV 항목.
 * 같은 좌표(소수 다섯째 자리, 약 1m)는 한 지점으로 합친다: 대수는 더하고 목적은 서로 다른 값만 '·'로 잇는다.
 * 카메라대수가 비면 1대로 센다.
 */
export function buildCctv(rows) {
  const sites = new Map();
  for (const r of rows) {
    const p = toPoint(r['위도'], r['경도']);
    if (!p) continue;
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const cameras = Math.max(1, Number.parseInt(r['카메라대수'], 10) || 1);
    const purpose = r['설치목적구분'] || '기타';
    const name = stripSido(r['소재지도로명주소'] || r['소재지지번주소'] || '') || 'CCTV';
    const site = sites.get(key);
    if (site) {
      site.cameras += cameras;
      if (!site.purposes.includes(purpose)) site.purposes.push(purpose);
    } else sites.set(key, { ...p, name, cameras, purposes: [purpose] });
  }
  return [...sites.values()]
    .sort((a, b) => byKey(a.name, b.name) || a.lat - b.lat || a.lng - b.lng)
    .map((s, i) => ({
      id: `cctv-${i + 1}`,
      type: 'cctv',
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      detail: { purpose: s.purposes.join('·'), cameras: s.cameras },
    }));
}

/** 숙박 레이어에 남기는 소분류. 밤에도 프런트가 열려 있는 곳만(펜션·캠핑·기숙사 등은 뺀다) */
export const LODGING_KINDS = ['호텔/리조트', '여관/모텔'];

/**
 * 상가(상권)정보 → 편의점(소분류 '편의점') 또는 숙박(대분류 '숙박' 중 LODGING_KINDS).
 * 같은 상가업소번호는 한 번만, 좌표와 상호가 모두 같으면 하나만 남긴다. 같은 건물의 다른 업소는 남는다.
 */
export function buildShop(rows, kind) {
  const pick =
    kind === 'convenience'
      ? (r) => r['상권업종소분류명'] === '편의점'
      : (r) => r['상권업종대분류명'] === '숙박' && LODGING_KINDS.includes(r['상권업종소분류명']);
  const seenNo = new Set();
  const seenPlace = new Set();
  const items = [];
  for (const r of rows) {
    if (!pick(r)) continue;
    const no = r['상가업소번호'];
    const p = toPoint(r['위도'], r['경도']);
    if (!no || !p || seenNo.has(no)) continue;
    seenNo.add(no);
    const name = [r['상호명'], r['지점명']].filter(Boolean).join(' ');
    const place = `${name}|${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (seenPlace.has(place)) continue;
    seenPlace.add(place);
    items.push({
      id: `${kind}-${no}`,
      type: kind,
      name,
      ...p,
      ...(kind === 'lodging' ? { detail: { kind: r['상권업종소분류명'] } } : {}),
    });
  }
  return items.sort((a, b) => byKey(a.id, b.id));
}

/** 주소 → 좌표 사전에서 찾는다. 없거나 null(실패)이면 null */
function lookup(geocode, address) {
  const g = geocode[address];
  return g ? toPoint(g.lat, g.lng) : null;
}

/** 경찰청 지구대·파출소 주소 현황 → 제주청 행. 좌표를 찾지 못한 행은 뺀다 */
export function buildPolice(rows, geocode) {
  const items = [];
  for (const r of rows) {
    if (r['시도청'] !== '제주청') continue;
    const p = lookup(geocode, r['주소']);
    if (!p) continue;
    items.push({
      id: `police-${r['연번']}`,
      type: 'police',
      name: `${r['경찰서']}경찰서 ${r['관서명']}${r['구분']}`,
      ...p,
      detail: { kind: r['구분'], address: normalizeAddress(r['주소']) },
    });
  }
  return items;
}

/** 제주특별자치도 응급의료기관 현황 → 응급실. 전화번호는 싣지 않는다 */
export function buildEr(rows, geocode) {
  const items = [];
  rows.forEach((r, i) => {
    const p = lookup(geocode, r['소재지']);
    if (!p) return;
    items.push({
      id: `er-${i + 1}`,
      type: 'er',
      name: r['의료기관'],
      ...p,
      detail: { kind: r['구분'].replace(/\s+/g, ''), address: normalizeAddress(r['소재지']) },
    });
  });
  return items;
}

/** 백엔드가 지오코딩한 119안전센터 → 119 */
export function buildFire(rows) {
  const items = [];
  rows.forEach((r, i) => {
    const p = toPoint(r.lat, r.lng);
    if (!p) return;
    items.push({
      id: `fire-${i + 1}`,
      type: 'fire',
      name: r.name,
      ...p,
      detail: { address: r.address },
    });
  });
  return items;
}

function readText(url, encoding = 'utf-8') {
  return new TextDecoder(encoding).decode(readFileSync(url));
}

/** rawDir(data-src/poi/)의 원본과 poi-sources.json으로 6종을 모두 만든다 */
export function buildAll(rawDir) {
  const base = new URL(String(rawDir).endsWith('/') ? String(rawDir) : `${rawDir}/`);
  const sources = JSON.parse(readFileSync(SOURCES_URL, 'utf8'));
  let geocode;
  const geocoded = () => (geocode ??= JSON.parse(readText(new URL(sources.geocodeCache, base))));
  const rowsOf = (kind) => {
    const s = sources.kinds[kind];
    return csvObjects(readText(new URL(s.raw.file, base), s.raw.encoding));
  };
  const builders = {
    cctv: () => buildCctv(rowsOf('cctv')),
    convenience: () => buildShop(rowsOf('convenience'), 'convenience'),
    lodging: () => buildShop(rowsOf('lodging'), 'lodging'),
    police: () => buildPolice(rowsOf('police'), geocoded()),
    fire: () => buildFire(rowsOf('fire')),
    er: () => buildEr(rowsOf('er'), geocoded()),
  };
  const out = {};
  for (const kind of POI_KINDS) {
    const s = sources.kinds[kind];
    if (s.status === 'pending') {
      out[kind] = { type: kind, status: 'pending', source: s.label, items: [] };
      continue;
    }
    const items = builders[kind]();
    out[kind] = {
      type: kind,
      status: items.length > 0 ? 'ready' : 'pending',
      source: s.label,
      fetchedAt: s.fetchedAt,
      items,
    };
  }
  return out;
}

/** 다시 만들어도 같은 바이트가 나오게 한 줄 JSON + 끝 줄바꿈 */
export function serializeLayer(layer) {
  return `${JSON.stringify(layer)}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rawArg = process.argv[2] ?? 'data-src/poi';
  const rawDir = pathToFileURL(`${rawArg.replace(/\/$/, '')}/`);
  const outDir = new URL('../public/data/poi/', import.meta.url);
  mkdirSync(outDir, { recursive: true });
  const layers = buildAll(rawDir);
  for (const kind of POI_KINDS) {
    const layer = layers[kind];
    writeFileSync(new URL(`${kind}.json`, outDir), serializeLayer(layer));
    console.log(`${kind}.json: ${layer.status} ${layer.items.length}곳`);
  }
}
