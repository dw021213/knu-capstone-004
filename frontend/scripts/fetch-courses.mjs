// OpenStreetMap에서 제주올레 relation 원본을 받아 data-src/courses/raw-osm/에 그대로 둔다.
// 정제는 build-courses.mjs가 한다(네트워크 없이). 로그인·API 키 없음.
// 실행: npm run data:courses:fetch -- [--courses 1,7,10,20]
import { mkdirSync, writeFileSync } from 'node:fs';
import { courseNumber } from './build-courses.mjs';

const RAW = new URL('../data-src/courses/raw-osm/', import.meta.url);
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const UA = 'knu-capstone-004 (https://github.com/dw021213/knu-capstone-004)';
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const i = args.indexOf('--courses');
const wanted = new Set((i >= 0 ? args[i + 1] : '1,7,10,20').split(',').map(Number));

/** 제주특별자치도 안의 걷기 길 relation 태그 전부(이름 표기가 제각각이라 걸러 내기는 받은 뒤에 한다) */
const TAGS_QUERY = `[out:json][timeout:90];
area["name"="제주특별자치도"]->.a;
relation(area.a)["route"~"hiking|foot"];
out tags;`;
const geomQuery = (id) => `[out:json][timeout:90];
relation(${id});
out geom;`;

/** Overpass는 붐비면 429·502·504를 준다. 잠깐 쉬고 다시 묻는다(최대 4번) */
async function overpass(query) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return res.text();
    if (attempt >= 4 || ![429, 502, 503, 504].includes(res.status)) {
      throw new Error(`Overpass 응답 ${res.status}`);
    }
    console.log(`Overpass 응답 ${res.status}, ${attempt * 10}초 뒤 다시`);
    await sleep(attempt * 10_000);
  }
}

mkdirSync(RAW, { recursive: true });
const tagsText = await overpass(TAGS_QUERY);
writeFileSync(new URL('relations.json', RAW), tagsText);
const candidates = JSON.parse(tagsText)
  .elements.map((e) => ({ id: e.id, n: courseNumber(e.tags ?? {}) }))
  .filter((c) => c.n !== null && wanted.has(c.n));
console.log(
  `relation ${candidates.length}개: ${candidates.map((c) => `${c.n}코스 ${c.id}`).join(', ')}`,
);

for (const c of candidates) {
  await sleep(2000);
  const text = await overpass(geomQuery(c.id));
  writeFileSync(new URL(`relation-${c.id}.json`, RAW), text);
  console.log(`relation ${c.id} 저장 (${text.length} bytes)`);
}

writeFileSync(
  new URL('fetch-log.json', RAW),
  `${JSON.stringify(
    {
      fetchedAt: today,
      endpoint: ENDPOINT,
      tagsQuery: TAGS_QUERY,
      geometryQuery: geomQuery('<id>'),
      relations: candidates.map((c) => c.id),
    },
    null,
    2,
  )}\n`,
);
