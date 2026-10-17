// 안동균(교통 모델) 전달본 risk_scores.csv → public/data/scores.json
// 실행: npm run data:scores
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROAD_CODE = { ITS_standard_nodelink: 1, NGII_digital_map: 2 };
const ROAD_CODES = { 0: 'none', 1: 'standard_link', 2: 'ngii_map' };
const REQUIRED = ['h3', 'risk_percentile', 'road_source'];

/**
 * @param {string} csvText 원천 CSV(첫 줄 헤더)
 * @param {string} datasetId 데이터 버전
 * @param {string} [generatedAt] 원천 생성 시각
 */
export function buildScores(csvText, datasetId, generatedAt = '') {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split(',');
  const col = Object.fromEntries(REQUIRED.map((name) => [name, header.indexOf(name)]));
  for (const name of REQUIRED) {
    if (col[name] < 0) throw new Error(`CSV에 ${name} 열이 없습니다`);
  }

  const cells = {};
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const raw = f[col.risk_percentile];
    const percentile = raw === '' ? null : Math.round(Number(raw) * 100) / 100;
    cells[f[col.h3]] = [percentile, ROAD_CODE[f[col.road_source]] ?? 0];
  }
  return { datasetId, generatedAt, roadCodes: ROAD_CODES, cells };
}

/** 다시 만들어도 같은 바이트가 나오게 한 줄 JSON + 끝 줄바꿈 */
export function serializeScores(scores) {
  return `${JSON.stringify(scores)}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('../', import.meta.url);
  const csv = readFileSync(new URL('data-src/risk_scores.csv', root), 'utf8');
  const meta = JSON.parse(readFileSync(new URL('data-src/risk_metadata.json', root), 'utf8'));
  const out = buildScores(csv, meta.dataset_id, meta.generated_at);
  mkdirSync(new URL('public/data/', root), { recursive: true });
  writeFileSync(new URL('public/data/scores.json', root), serializeScores(out));
  console.log(`scores.json: 셀 ${Object.keys(out.cells).length}개 (${meta.dataset_id})`);
}
