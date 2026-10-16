import type { Segment } from '../../entities/course/segments';
import type { CourseSummary } from '../../entities/course/summary';
import type { MapFocus, MapRoute } from '../map/MapView';

/** 구간 좌표의 가운데 점(촘촘히 한 점 중 가운데). 주의 지점 빨간 점을 여기에 찍는다 */
export function segmentMid(seg: Segment): [number, number] {
  return seg.coords[Math.floor((seg.coords.length - 1) / 2)];
}

/** 지도에 그릴 경로: 구간별 등급 색, 주의 구간마다 번호(1부터, 코스 순서) */
export function courseRoute(s: CourseSummary): MapRoute {
  return {
    lines: s.segments.map((g) => ({ coords: g.coords, level: g.level })),
    marks: s.caution.map((g, i) => ({ lngLat: segmentMid(g), label: String(i + 1) })),
  };
}

/** 경로가 지나는 셀(이 밖의 셀은 흐리게) */
export const routeCells = (s: CourseSummary) => new Set(s.segments.map((g) => g.h3));

export function bboxOf(coords: [number, number][]): [number, number, number, number] {
  let [w, so, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of coords) {
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    so = Math.min(so, lat);
    n = Math.max(n, lat);
  }
  return [w, so, e, n];
}

/** 코스 전체 보기. 모바일은 아래 시트 위쪽에 둔다 */
export function courseFocus(key: number, coords: [number, number][], wide: boolean): MapFocus {
  const bbox = bboxOf(coords);
  return {
    key,
    bbox,
    point: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    zoom: { min: 9, max: 14 },
    anchorY: wide ? 0.5 : 0.3,
  };
}

/** 주의 구간 하나로 옮겨 확대 */
export function segmentFocus(key: number, seg: Segment, wide: boolean): MapFocus {
  return {
    key,
    bbox: bboxOf(seg.coords),
    point: segmentMid(seg),
    zoom: { min: 14, max: 15 },
    anchorY: wide ? 0.5 : 0.3,
  };
}
