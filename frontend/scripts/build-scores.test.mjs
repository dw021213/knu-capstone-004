// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildScores, serializeScores } from './build-scores.mjs';

const csv = readFileSync(new URL('../data-src/risk_scores.csv', import.meta.url), 'utf8');
const meta = JSON.parse(
  readFileSync(new URL('../data-src/risk_metadata.json', import.meta.url), 'utf8'),
);

describe('buildScores', () => {
  const out = buildScores(csv, meta.dataset_id, meta.generated_at);

  it('셀 3,651개, 빈 백분위 1,402개', () => {
    const v = Object.values(out.cells);
    expect(v.length).toBe(3651);
    expect(v.filter(([p]) => p === null).length).toBe(1402);
  });

  it('도로 출처 코드: 표준노드링크 1, 수치지도 2, 미확인 0', () => {
    expect(out.cells['8830d02011fffff']).toEqual([3.6, 1]);
    expect(out.cells['8830d10c41fffff']).toEqual([7.29, 2]);
    expect(out.cells['8830d02019fffff']).toEqual([null, 0]);
    const codes = Object.values(out.cells).map(([, c]) => c);
    expect(codes.filter((c) => c === 1).length).toBe(2200);
    expect(codes.filter((c) => c === 2).length).toBe(49);
    expect(codes.filter((c) => c === 0).length).toBe(1402);
    expect(out.roadCodes).toEqual({ 0: 'none', 1: 'standard_link', 2: 'ngii_map' });
  });

  it('데이터 버전과 생성일을 그대로 싣는다', () => {
    expect(out.datasetId).toBe('jeju_h3_r8_road_islands_its20260914_ngii2025_v1');
    expect(out.generatedAt).toBe('2026-10-12T09:47:48.581628+09:00');
  });

  it('CRLF 줄바꿈과 끝 빈 줄을 견딘다', () => {
    const small =
      'h3,risk_score,risk_percentile,has_road,road_source\r\n' +
      'a,0.1,12.345,True,ITS_standard_nodelink\r\n' +
      'b,0.002,,False,no_mapped_road\r\n\r\n';
    expect(buildScores(small, 'test').cells).toEqual({ a: [12.35, 1], b: [null, 0] });
  });

  it('필수 열이 없으면 실패한다', () => {
    expect(() => buildScores('h3,risk_score\nx,1\n', 'test')).toThrow(/risk_percentile/);
  });

  it('public/data/scores.json이 원천 CSV로 다시 만든 결과와 같다', () => {
    const committed = readFileSync(new URL('../public/data/scores.json', import.meta.url), 'utf8');
    expect(committed).toBe(serializeScores(out));
  });

  it('metadata 정제본에 PC 절대경로가 없다', () => {
    const text = readFileSync(new URL('../data-src/risk_metadata.json', import.meta.url), 'utf8');
    expect(text).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\\\/);
    expect(meta.model_source).toBe('road_paper_islands_v3');
    expect(meta.input_sources.standard_link.path).toBe('[2026-09-14]NODELINKDATA.zip');
  });

  it('gzip 300KB 이하', () => {
    expect(gzipSync(JSON.stringify(out)).length).toBeLessThanOrEqual(300 * 1024);
  });
});
