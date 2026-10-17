import { tile } from 'd3-tile';
import { BASEMAP } from './basemap';
import { TILE, worldSize } from './projection';
import { BASE_Z, type View } from './view';

export interface ScreenTile {
  x: number;
  y: number;
  z: number;
  /** 화면 CSS 픽셀 위치와 그릴 너비·높이(정수 px) */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 반올림 전 한 변 길이 */
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
  // 두 끝을 정수 px로 반올림해 이웃 타일이 딱 맞물리게 한다(소수 위치의 1px 이음매를 없앤다).
  // 너비·높이는 반올림한 끝 - 반올림한 시작이라 타일마다 1px 다를 수 있고, 투영과의 차이는 0.5px 안이다
  return tiles.map(([x, y, z]) => {
    const left = Math.round((x + tx) * k);
    const top = Math.round((y + ty) * k);
    const width = Math.round((x + 1 + tx) * k) - left;
    const height = Math.round((y + 1 + ty) * k) - top;
    return { x, y, z, left, top, width, height, size: k };
  });
}

/** 배경 타일 주소(공급자는 basemap.ts) */
export function tileUrl({ x, y, z }: { x: number; y: number; z: number }): string {
  return BASEMAP.url(z, x, y);
}
