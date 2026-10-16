/**
 * 배경 지도 공급자. 공급자를 바꿀 때(CARTO 키, 다른 업체) 이 파일만 고친다.
 * 지금은 OSM 표준 타일. 사용 정책상 대량 트래픽 서비스에는 쓰지 않는다.
 */
export const BASEMAP = {
  url: (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  attribution: '© OpenStreetMap contributors',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
  /** true면 @2x 타일(레티나) */
  retina: false,
} as const;
