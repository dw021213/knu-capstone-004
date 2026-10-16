import { tile } from 'd3-tile';
import { TILE, worldSize } from './projection';
import { BASE_Z, type View } from './view';

export interface ScreenTile {
  x: number;
  y: number;
  z: number;
  /** 화면 CSS 픽셀 위치와 한 변 길이 */
  left: number;
  top: number;
  size: number;
}

const S0 = worldSize(BASE_Z);

/** 화면에 보이는 정수 줌(round(9 + log2 k)) 타일 목록 */
export function visibleTiles(v: View, width: number, height: number): ScreenTile[] {
  // d3-tile은 세계 중심(경위도 0,0)의 화면 위치와 세계 너비를 받는다
  const tiles = tile()
    .size([width, height])
    .tileSize(TILE)
    .scale(S0 * v.k)
    .translate([v.x + (S0 * v.k) / 2, v.y + (S0 * v.k) / 2])();
  const [tx, ty] = tiles.translate;
  const k = tiles.scale;
  return tiles.map(([x, y, z]) => ({ x, y, z, left: (x + tx) * k, top: (y + ty) * k, size: k }));
}

const SUBDOMAINS = 'abcd';

/** CARTO Voyager 래스터 타일(레티나 @2x) */
export function tileUrl({ x, y, z }: { x: number; y: number; z: number }): string {
  const s = SUBDOMAINS[(x + y) % SUBDOMAINS.length];
  return `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`;
}
