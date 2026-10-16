// 시설 원본을 네트워크에서 받아 data-src/poi/raw-<출처>/에 둔다. 정제는 build-poi.mjs가 한다.
// 로그인·API 키가 필요 없는 공개 파일만 쓴다.
// 실행: npm run data:poi:fetch -- [--only cctv,shop,police,er,fire,geocode] [--shop-zip <받아 둔 zip>]
import {
  closeSync,
  copyFileSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOUNDS, SOURCES_URL, csvObjects, normalizeAddress } from './build-poi.mjs';
import { findZipEntry, pickGeocode } from './fetch-poi-lib.mjs';

const RAW = new URL('../data-src/poi/', import.meta.url);
const PORTAL = 'https://www.data.go.kr';
const UA = 'knu-capstone-004 (https://github.com/dw021213/knu-capstone-004)';
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = new Set((argOf('--only') ?? 'cctv,shop,police,er,fire,geocode').split(','));
const sources = JSON.parse(readFileSync(SOURCES_URL, 'utf8'));

async function get(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...init.headers } });
  if (!res.ok) throw new Error(`${url} 응답 ${res.status}`);
  return res;
}

/** 공공데이터포털 파일데이터 페이지의 '다운로드' 버튼과 같은 순서로 실제 파일 주소를 찾는다(로그인 없음) */
async function portalFileUrl(publicDataPk) {
  const page = await (await get(`${PORTAL}/data/${publicDataPk}/fileData.do`)).text();
  const m = page.match(/fn_fileDataDown\('(\d+)', '([^']+)', '([^']*)','(\d+)'/);
  if (!m) throw new Error(`${publicDataPk}: 다운로드 버튼을 찾지 못함`);
  const body = new URLSearchParams({
    publicDataDetailPk: m[2],
    publicDataPk,
    atchFileId: m[3],
    fileDetailSn: m[4],
    publicDataTyCode: 'PR0051',
  });
  const res = await get(`${PORTAL}/tcs/dss/selectFileDataDownload.do`, { method: 'POST', body });
  const info = await res.json();
  if (!info.status) throw new Error(`${publicDataPk}: ${info.error ?? '파일 정보를 받지 못함'}`);
  return `${PORTAL}/cmm/cmm/fileDownload.do?atchFileId=${info.atchFileId}&fileDetailSn=${info.fileDetailSn}&insertDataPrcus=N`;
}

function writeRaw(file, data) {
  const url = new URL(file, RAW);
  mkdirSync(new URL('./', url), { recursive: true });
  writeFileSync(url, data);
}

const csvField = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const toCsv = (header, rows) =>
  `${[header, ...rows].map((r) => r.map(csvField).join(',')).join('\n')}\n`;

function record(kind, patch) {
  const raw = { ...sources.kinds[kind].raw, ...patch.raw };
  Object.assign(sources.kinds[kind], patch, { raw });
}

/** 원본 파일을 바이트 그대로 저장(경찰, 응급실) */
async function fetchPortalFile(kind) {
  const s = sources.kinds[kind];
  const url = await portalFileUrl(s.publicDataPk);
  const bytes = Buffer.from(await (await get(url)).arrayBuffer());
  writeRaw(s.raw.file, bytes);
  const rows = csvObjects(new TextDecoder(s.raw.encoding).decode(bytes)).length;
  record(kind, { fetchedAt: today, download: url, raw: { rows } });
  console.log(`${kind}: ${rows}행 저장 (${bytes.length} bytes)`);
}

/** 전국CCTV표준데이터: 포털 표준데이터 화면의 CSV 내려받기와 같은 JSON을 쪽마다 받아 제주 행만 남긴다 */
async function fetchCctv() {
  const s = sources.kinds.cctv;
  const cols = await (
    await get(`${PORTAL}/download/columList.json?pk=${s.publicDataPk}&ext=CSV`)
  ).json();
  const codes = cols.columList.map((c) => c.columCode);
  const names = cols.columList.map((c) => c.columNm);
  const query = new URLSearchParams({ publicDataPk: s.publicDataPk });
  for (const c of cols.tableVO.colNmList) query.append('colNmList', c);
  query.set('totalCount', String(cols.totalCount));
  query.set('svcTableNm', cols.tableVO.svcTableNm);
  query.set('perPage', '10000');
  let total = 0;
  const jeju = [];
  for (let page = 1; page < 100; page++) {
    query.set('page', String(page));
    const rows = await (await get(`${PORTAL}/download/standard.json?${query}`)).json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    total += rows.length;
    for (const r of rows) {
      const address = r.RDNMADR || r.LNMADR || '';
      if ((r.INSTT_NM ?? '').includes('제주') || address.startsWith('제주')) jeju.push(r);
    }
    await sleep(1000);
  }
  writeRaw(
    s.raw.file,
    toCsv(
      names,
      jeju.map((r) => codes.map((c) => r[c])),
    ),
  );
  record('cctv', {
    fetchedAt: today,
    download: `${PORTAL}/download/standard.json?publicDataPk=${s.publicDataPk}`,
    raw: { rows: jeju.length, nationalRows: total },
  });
  console.log(`cctv: 전국 ${total}행 중 제주 ${jeju.length}행 저장`);
}

/** zip 파일에서 항목 하나를 푼다(파일 전체를 메모리에 올리지 않음) */
function readZipEntry(zipPath, match) {
  const fd = openSync(zipPath, 'r');
  try {
    const read = (pos, len) => {
      const b = Buffer.alloc(len);
      readSync(fd, b, 0, len, pos);
      return b;
    };
    return findZipEntry({ size: fstatSync(fd).size, read }, match);
  } finally {
    closeSync(fd);
  }
}

/** 상가(상권)정보: 전국 zip(약 350MB)에서 제주 파일만 꺼내 편의점·숙박 행만 남긴다 */
async function fetchShop() {
  const s = sources.kinds.convenience;
  let zipPath = argOf('--shop-zip');
  let url = s.download;
  if (!zipPath) {
    url = await portalFileUrl(s.publicDataPk);
    zipPath = join(tmpdir(), 'semas-shop.zip');
    console.log(`shop: ${url} 받는 중(약 350MB)`);
    writeFileSync(zipPath, Buffer.from(await (await get(url)).arrayBuffer()));
  }
  const { name, bytes } = readZipEntry(zipPath, (n) => n.includes('_제주_'));
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const rows = csvObjects(text);
  const header = Object.keys(rows[0]);
  const keep = rows.filter(
    (r) => r['상권업종소분류명'] === '편의점' || r['상권업종대분류명'] === '숙박',
  );
  writeRaw(
    s.raw.file,
    toCsv(
      header,
      keep.map((r) => header.map((h) => r[h])),
    ),
  );
  const raw = { rows: keep.length, sourceFile: name, sourceRows: rows.length };
  for (const kind of ['convenience', 'lodging']) {
    record(kind, { fetchedAt: today, download: url, raw });
  }
  console.log(`shop: ${name} ${rows.length}행 중 편의점·숙박 ${keep.length}행 저장`);
}

function fetchFire() {
  const s = sources.kinds.fire;
  const from = new URL(`../../${s.copiedFrom}`, import.meta.url);
  const to = new URL(s.raw.file, RAW);
  mkdirSync(new URL('./', to), { recursive: true });
  copyFileSync(from, to);
  const rows = csvObjects(readFileSync(to, 'utf8')).length;
  record('fire', { fetchedAt: today, raw: { rows } });
  console.log(`fire: ${s.copiedFrom}에서 ${rows}행 복사`);
}

async function nominatim(q) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '3',
    countrycodes: 'kr',
    viewbox: `${BOUNDS.west},${BOUNDS.north},${BOUNDS.east},${BOUNDS.south}`,
    bounded: '1',
  }).toString();
  const res = await (await get(url, { headers: { 'Accept-Language': 'ko' } })).json();
  await sleep(1100); // 사용 정책: 1초에 1건
  return res;
}

/** 주소로 한 번, 필요하면 이름으로 한 번 더 질의하고 pickGeocode로 고른다 */
async function geocodeOne(address, nameQuery, expectType) {
  const addressResults = await nominatim(normalizeAddress(address));
  const input = { address, expectType, addressResults, nameQuery, nameResults: [] };
  if (addressResults.some((r) => r.type === expectType)) return pickGeocode(input);
  return pickGeocode({ ...input, nameResults: await nominatim(nameQuery) });
}

async function geocodeAll() {
  const cacheUrl = new URL(sources.geocodeCache, RAW);
  let cache = {};
  try {
    cache = JSON.parse(readFileSync(cacheUrl, 'utf8'));
  } catch {
    cache = {};
  }
  const read = (kind) =>
    csvObjects(
      new TextDecoder(sources.kinds[kind].raw.encoding).decode(
        readFileSync(new URL(sources.kinds[kind].raw.file, RAW)),
      ),
    );
  const jobs = [
    ...read('police')
      .filter((r) => r['시도청'] === '제주청')
      .map((r) => [r['주소'], `${r['관서명']}${r['구분']} 제주`, 'police']),
    ...read('er').map((r) => [r['소재지'], r['의료기관'], 'hospital']),
  ];
  for (const [address, nameQuery, type] of jobs) {
    // 사람이 확인해 넣은 좌표(matchedBy: manual)는 --regeocode에서도 덮어쓰지 않는다
    if (cache[address]?.matchedBy === 'manual') continue;
    if (address in cache && !args.includes('--regeocode')) continue;
    cache[address] = await geocodeOne(address, nameQuery, type);
    const g = cache[address];
    console.log(`${g ? g.matchedBy : '실패'}\t${address}\t${g?.displayName ?? ''}`);
  }
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(cacheUrl, `${JSON.stringify(sorted, null, 2)}\n`);
  const failed = jobs.filter(([a]) => !cache[a]).length;
  console.log(`geocode: ${jobs.length}건 중 실패 ${failed}건`);
}

if (only.has('fire')) fetchFire();
if (only.has('police')) await fetchPortalFile('police');
if (only.has('er')) await fetchPortalFile('er');
if (only.has('cctv')) await fetchCctv();
if (only.has('shop')) await fetchShop();
if (only.has('geocode')) await geocodeAll();
writeFileSync(SOURCES_URL, `${JSON.stringify(sources, null, 2)}\n`);
