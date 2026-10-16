// d3-tile 1.0에는 타입이 없어 여기서 쓰는 만큼만 선언한다
declare module 'd3-tile' {
  export interface Tiles extends Array<[number, number, number]> {
    translate: [number, number];
    scale: number;
  }
  export interface TileLayout {
    (): Tiles;
    size(size: [number, number]): TileLayout;
    extent(extent: [[number, number], [number, number]]): TileLayout;
    scale(scale: number): TileLayout;
    translate(translate: [number, number]): TileLayout;
    tileSize(size: number): TileLayout;
    zoomDelta(delta: number): TileLayout;
    clamp(clamp: boolean): TileLayout;
  }
  export function tile(): TileLayout;
}
