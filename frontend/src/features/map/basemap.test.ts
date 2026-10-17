// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BASEMAP } from './basemap';
import { tileUrl } from './tiles';

/** Playwright route glob(** = 아무 문자열, * = / 없는 문자열)을 정규식으로 */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

describe('BASEMAP (OSM 표준 타일)', () => {
  it('타일 주소와 출처, 1x 타일', () => {
    expect(BASEMAP.url(9, 437, 203)).toBe('https://tile.openstreetmap.org/9/437/203.png');
    expect(BASEMAP.attribution).toBe('© OpenStreetMap contributors');
    expect(BASEMAP.attributionUrl).toBe('https://www.openstreetmap.org/copyright');
    expect(BASEMAP.retina).toBe(false);
  });

  it('지도 컴포넌트가 쓰는 tileUrl이 BASEMAP을 따른다', () => {
    expect(tileUrl({ x: 437, y: 203, z: 9 })).toBe(BASEMAP.url(9, 437, 203));
  });

  it('e2e fixture의 타일 가로채기 패턴이 BASEMAP 주소와 맞는다(네트워크 없는 e2e)', () => {
    const src = readFileSync(new URL('../../../tests/e2e/fixtures.ts', import.meta.url), 'utf8');
    const pattern = src.match(/page\.route\(\s*'([^']+)'/)?.[1];
    expect(pattern).toBeDefined();
    for (const [z, x, y] of [
      [9, 437, 203],
      [16, 55800, 26290],
    ]) {
      expect(BASEMAP.url(z, x, y)).toMatch(globToRegExp(pattern!));
    }
  });
});
