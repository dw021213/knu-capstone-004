import { ISLAND_BOUNDS, SCALE_EXTENT, worldExtent, type View } from './view';

type Bounds = { west: number; east: number; south: number; north: number };

/**
 * 시험용 고정 화면: 경계가 화면에 들어오도록 맞춘 변환(제품 코드는 homeView·focusView를 쓴다).
 * cellCanvas·routeCanvas 시험의 픽셀 기대값이 이 화면을 기준으로 한다
 */
export function fitView(
  width: number,
  height: number,
  b: Bounds = ISLAND_BOUNDS,
  pad = 0.06,
): View {
  const [[x0, y0], [x1, y1]] = worldExtent(b);
  const k0 = Math.min((width * (1 - 2 * pad)) / (x1 - x0), (height * (1 - 2 * pad)) / (y1 - y0));
  const k = Math.min(SCALE_EXTENT[1], Math.max(SCALE_EXTENT[0], k0));
  return { k, x: width / 2 - ((x0 + x1) / 2) * k, y: height / 2 - ((y0 + y1) / 2) * k };
}
