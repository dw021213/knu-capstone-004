// OSM 제주올레 relation 원본(data-src/courses/raw-osm/) → public/data/courses.json
// 실행: npm run data:courses  (네트워크 없이 커밋된 원본만 읽는다. 받기는 fetch-courses.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** 올레를 말하는 표기(이름·ref). 여기에 걸리는데 번호 꼴이 아니면 갈래·변형 코스로 본다 */
const OLLE_HINT = /올레|olle|^JOT/i;
/** 본 코스 표기: '올레길1', '올레길 20코스', 'Jeju Olle Trail Route 7', 'Ollegil 10', '올레길6 (Ollegil 6)', 'JOT20' */
const COURSE_NAME =
  /^(?:제주\s*)?(?:올레길?|jeju olle trail(?: route)?|olle trail|ollegil)\s*(\d{1,2})\s*(?:코스)?(?:\s*\((?:ollegil|olle trail)\s*\1\))?$/i;
const COURSE_REF = /^JOT(\d{1,2})$/i;

/** relation 태그(name, name:ko, name:en, ref)에서 본 코스 번호. 갈래(1-1, 6A)·휠체어 구간·표기끼리 다르면 null */
export function courseNumber(tags) {
  const found = new Set();
  for (const key of ['name', 'name:ko', 'name:en', 'ref']) {
    const v = tags[key]?.trim();
    if (!v || !OLLE_HINT.test(v)) continue;
    const m = v.match(key === 'ref' ? COURSE_REF : COURSE_NAME);
    if (!m) return null;
    found.add(Number(m[1]));
  }
  return found.size === 1 ? [...found][0] : null;
}

/** 지구 평균 반지름(m). src/shared/geo/distance.ts와 같은 하버사인 */
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
export function distanceM([lng1, lat1], [lng2, lat2]) {
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLengthM(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distanceM(coords[i - 1], coords[i]);
  return m;
}

/** 이어 붙일 때 같은 점으로 보는 거리(m). 이보다 먼 연결은 끊긴 곳으로 센다 */
const JOIN_M = 1;

function chainFrom(ways, start) {
  const left = new Set(ways.keys());
  left.delete(start);
  const line = [...ways[start]];
  const gaps = [];
  while (left.size > 0) {
    // 지금 줄의 두 끝 중 하나와 가장 가까운 끝점을 가진 way
    let best = null;
    for (const i of left) {
      const w = ways[i];
      const head = line[0];
      const tail = line[line.length - 1];
      const options = [
        [distanceM(tail, w[0]), 'tail', false],
        [distanceM(tail, w[w.length - 1]), 'tail', true],
        [distanceM(head, w[w.length - 1]), 'head', false],
        [distanceM(head, w[0]), 'head', true],
      ];
      for (const [d, end, flip] of options) if (!best || d < best.d) best = { d, end, flip, i };
    }
    left.delete(best.i);
    const w = best.flip ? [...ways[best.i]].reverse() : ways[best.i];
    const joined = best.d <= JOIN_M;
    if (!joined) gaps.push(Math.round(best.d));
    if (best.end === 'tail') line.push(...(joined ? w.slice(1) : w));
    else line.unshift(...(joined ? w.slice(0, -1) : w));
  }
  return { coords: line, gaps };
}

/**
 * way들을 끝점이 가까운 순으로 이어 LineString 하나로 만든다(뒤집기 허용).
 * 시작 way에 따라 결과가 달라 모든 way에서 시작해 보고 전체 길이가 가장 짧은 것을 고른다.
 * gaps: 끝점이 1m보다 떨어진 연결의 간격(m). 그 사이는 직선으로 잇는다
 */
export function chainWays(ways) {
  let best = null;
  for (let s = 0; s < ways.length; s++) {
    const c = chainFrom(ways, s);
    const len = lineLengthM(c.coords);
    if (!best || len < best.len) best = { ...c, len };
  }
  return { coords: best.coords, gaps: best.gaps };
}

/** 이보다 짧고(m) */
const STRAY_MAX_M = 50;
/** 다른 way 끝점이 이 거리(m) 안에 하나도 없는 조각은 경로 밖 조각으로 보고 뺀다 */
const STRAY_NEAR_M = 100;

export function dropStrays(ways) {
  const kept = [];
  const dropped = [];
  ways.forEach((w, i) => {
    const ends = [w[0], w[w.length - 1]];
    const near = ways.some(
      (o, j) =>
        j !== i &&
        ends.some((e) => [o[0], o[o.length - 1]].some((p) => distanceM(e, p) <= STRAY_NEAR_M)),
    );
    if (lineLengthM(w) < STRAY_MAX_M && !near) dropped.push(w);
    else kept.push(w);
  });
  return { kept, dropped };
}

/** 공식 길이와 이만큼(비율) 넘게 다르면 다른 길로 보고 뺀다 */
export const LENGTH_TOLERANCE = 0.2;
/** 좌표 자릿수(소수 다섯째 자리, 약 1m) */
const round5 = (v) => Math.round(v * 1e5) / 1e5;
/** 이보다 가까운(m) 다음 점은 버린다(구간 계산이 50m 간격으로 다시 촘촘히 한다) */
const MIN_STEP_M = 10;

export const SOURCE = '© OpenStreetMap contributors, ODbL 1.0 (제주올레 relation)';

function thin(coords) {
  const out = [coords[0]];
  for (let i = 1; i < coords.length - 1; i++) {
    if (distanceM(out[out.length - 1], coords[i]) >= MIN_STEP_M) out.push(coords[i]);
  }
  out.push(coords[coords.length - 1]);
  return out;
}

/** Overpass `out geom` 응답 → way 좌표 목록 [lng, lat][][] */
function relationWays(rel) {
  return rel.members
    .filter((m) => m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length > 1)
    .map((m) => m.geometry.map((g) => [g.lon, g.lat]));
}

/**
 * raw: { tags: relations.json, relations: { [id]: relation-<id>.json }, official: official.json, log: fetch-log.json }
 * 공식 코스마다 후보 relation(번호가 같은 것) 중 길이가 공식 값에 가장 가까운 것을 고르고, ±20% 밖이면 뺀다.
 */
export function buildCourses(raw) {
  const candidates = raw.tags.elements
    .map((e) => ({ id: e.id, n: courseNumber(e.tags ?? {}) }))
    .filter((c) => c.n !== null);
  const items = [];
  const report = [];
  for (const off of raw.official.courses) {
    const tried = [];
    for (const c of candidates.filter((x) => x.n === off.number)) {
      const res = raw.relations[c.id];
      const rel = res?.elements?.find((e) => e.type === 'relation' && e.id === c.id);
      if (!rel) continue;
      const { kept, dropped } = dropStrays(relationWays(rel));
      if (kept.length === 0) continue;
      let { coords, gaps } = chainWays(kept);
      // 공식 시작점에 가까운 끝을 앞에 둔다
      const start = off.start?.lngLat;
      if (start && distanceM(coords[coords.length - 1], start) < distanceM(coords[0], start)) {
        coords = [...coords].reverse();
        gaps = [...gaps].reverse();
      }
      coords = thin(coords.map(([lng, lat]) => [round5(lng), round5(lat)]));
      const km = lineLengthM(coords) / 1000;
      tried.push({ id: c.id, km, coords, gaps, dropped: dropped.length });
    }
    tried.sort((a, b) => Math.abs(a.km - off.km) - Math.abs(b.km - off.km));
    const best = tried[0];
    const ok = best && Math.abs(best.km - off.km) <= off.km * LENGTH_TOLERANCE;
    report.push({
      number: off.number,
      officialKm: off.km,
      status: ok ? 'ok' : 'excluded',
      relation: best?.id ?? null,
      osmKm: best ? Math.round(best.km * 100) / 100 : null,
      gaps: best?.gaps.length ?? 0,
      maxGapM: best && best.gaps.length > 0 ? Math.max(...best.gaps) : 0,
      dropped: best?.dropped ?? 0,
      candidates: tried.map((t) => ({ id: t.id, km: Math.round(t.km * 100) / 100 })),
    });
    if (!ok) continue;
    items.push({
      id: `olle-${off.number}`,
      name: `제주올레 ${off.number}코스`,
      lengthKm: Math.round(best.km * 10) / 10,
      officialKm: off.km,
      osmRelation: best.id,
      gaps: best.gaps.length,
      maxGapM: report[report.length - 1].maxGapM,
      coords: best.coords,
    });
  }
  const file = {
    status: items.length > 0 ? 'ready' : 'pending',
    source: SOURCE,
    fetchedAt: raw.log.fetchedAt,
    items,
  };
  return { file, report };
}

/** 코스마다 한 줄(좌표는 한 줄에 몰아 diff를 줄인다) */
export function serializeCourses(file) {
  const { items, ...head } = file;
  const lines = items.map((it) => `    ${JSON.stringify(it)}`);
  const headJson = JSON.stringify(head, null, 2).slice(0, -2);
  return `${headJson},\n  "items": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

const RAW_DIR = new URL('../data-src/courses/raw-osm/', import.meta.url);
const OFFICIAL = new URL('../data-src/courses/official.json', import.meta.url);
export const OUT = new URL('../public/data/courses.json', import.meta.url);

export function readRaw() {
  const read = (u) => JSON.parse(readFileSync(u, 'utf8'));
  const log = read(new URL('fetch-log.json', RAW_DIR));
  const relations = {};
  for (const id of log.relations) relations[id] = read(new URL(`relation-${id}.json`, RAW_DIR));
  return {
    tags: read(new URL('relations.json', RAW_DIR)),
    relations,
    official: read(OFFICIAL),
    log,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { file, report } = buildCourses(readRaw());
  writeFileSync(OUT, serializeCourses(file));
  for (const r of report) {
    console.log(
      `${r.number}코스: ${r.status} relation ${r.relation} OSM ${r.osmKm}km / 공식 ${r.officialKm}km, 끊긴 곳 ${r.gaps}(최대 ${r.maxGapM}m), 뺀 조각 ${r.dropped}, 후보 ${JSON.stringify(r.candidates)}`,
    );
  }
  console.log(`코스 ${file.items.length}개 → ${OUT.pathname}`);
}
