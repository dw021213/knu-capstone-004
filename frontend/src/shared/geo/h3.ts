import { cellToBoundary, cellToLatLng } from 'h3-js';

/** H3 셀 외곽. h3-js는 반시계 방향이라 d3-geo가 안쪽으로 보는 시계 방향으로 뒤집는다 */
export function cellPolygon(h3: string): GeoJSON.Polygon {
  const ring = cellToBoundary(h3, true) as [number, number][]; // [lng, lat], 반시계, 닫힘
  return { type: 'Polygon', coordinates: [ring.slice().reverse()] };
}

/** 셀 중심 [경도, 위도] */
export const cellCenter = (h3: string): [number, number] => {
  const [lat, lng] = cellToLatLng(h3);
  return [lng, lat];
};
