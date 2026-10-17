import type { PoiLayer, PoiType } from '../../data/types';
import {
  PILL_MAX_SHIFT,
  placeMarkers,
  type MarkerItem,
  type MarkerLayout,
} from '../map/markerCanvas';
import { clusterPoints, inView } from './cluster';
import { LAYER_DEFS } from './layerDefs';

/** 이 줌 미만이면 종류별 클러스터, 이상이면 개별 마커 */
export const CLUSTER_MAX_Z = 13;
/** 클러스터 격자 칸(px). 알약(`CCTV 128`) 폭에 맞춰 계획 기본값 48보다 넓게 */
export const CLUSTER_PX = 96;
/** 이 줌 미만(섬 전체가 한 화면)에서는 종류마다 알약 수를 제한한다 */
export const LOW_ZOOM = 11;
export const MAX_PILLS_LOW_ZOOM = 12;
/** 알약이 너무 많을 때 칸을 키우는 배율, 합치며 다시 놓는 최대 반복 */
const GROW = 1.15;
const MAX_ROUNDS = 60;

/** 한 묶음: 월드 픽셀 좌표 합(무게중심 = 합 / 개수)과 시설 id */
interface Bunch {
  group: PoiType;
  sx: number;
  sy: number;
  ids: string[];
}
/** 화면 밖 여백(px). 이 밖은 그리지 않는다 */
const MARGIN = 32;

/** 글꼴을 모를 때 알약 글자 폭 어림: 한글 12px, 나머지 7.5px(12px 굵은 글꼴) */
const estimateText = (t: string) =>
  [...t].reduce((s, ch) => s + (/[가-힣]/.test(ch) ? 12 : 7.5), 0);

/**
 * 켠(ready) 레이어들 → 지도 상태마다 그릴 마커·클러스터를 만드는 함수.
 *
 * 낮은 줌의 알약은 실제 위치(묶음 무게중심)에서 알약 한 줄(PILL_MAX_SHIFT)보다 멀리 비켜 놓지 않는다.
 * 그 안에서 겹침을 피할 수 없으면 가장 가까운 같은 종류 묶음과 합쳐 더 크게 묶는다. 섬 전체가 보이는 줌(LOW_ZOOM 미만)
 * 에서는 종류마다 알약이 MAX_PILLS_LOW_ZOOM개를 넘으면 칸을 키운다. 칸과 자리는 월드 픽셀에서 모든 시설로
 * 정하므로 지도를 끌어도 묶음과 알약 자리가 바뀌지 않는다.
 */
export function buildMarkerLayout(layers: PoiLayer[]): MarkerLayout {
  return ({ width, height, zoom, view, project, measure = estimateText }) => {
    const visible = (x: number, y: number) => inView(x, y, width, height, MARGIN);
    if (zoom >= CLUSTER_MAX_Z) {
      const items: MarkerItem[] = [];
      for (const layer of layers) {
        const { shape } = LAYER_DEFS[layer.type];
        for (const p of layer.items) {
          const [x, y] = project(p.lng, p.lat);
          if (visible(x, y))
            items.push({ kind: 'marker', group: layer.type, shape, x, y, id: p.id });
        }
      }
      return items;
    }

    // 격자를 화면이 아니라 월드 픽셀에 붙여 끌어도 묶음이 바뀌지 않게 한다
    const world = (lng: number, lat: number): [number, number] => {
      const [x, y] = project(lng, lat);
      return [x - view.x, y - view.y];
    };
    const order = new Map(layers.map((l, i) => [l.type, i]));

    // 1. 종류마다 격자로 묶는다. 섬 전체가 보이는 줌에서 알약이 너무 많은 종류는 칸을 키운다
    const cap = Math.max(width, height) * 4;
    const bunches: Bunch[] = [];
    for (const layer of layers) {
      let size = CLUSTER_PX;
      let clusters = clusterPoints(layer.items, world, size);
      while (
        zoom < LOW_ZOOM &&
        size < cap &&
        clusters.filter((c) => c.count > 1).length > MAX_PILLS_LOW_ZOOM
      ) {
        size *= GROW;
        clusters = clusterPoints(layer.items, world, size);
      }
      for (const c of clusters)
        bunches.push({ group: layer.type, sx: c.x * c.count, sy: c.y * c.count, ids: c.ids });
    }

    // 2. 큰 묶음부터 제자리에 두고, 나머지는 한 줄 안에서 비켜 놓는다. 한 줄 안에 자리가 없는 알약은
    //    가장 가까운 같은 종류 묶음과 합쳐(더 크게 묶어) 다시 놓는다
    let worldItems: MarkerItem[] = [];
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const markers: MarkerItem[] = [];
      const pills: MarkerItem[] = [];
      const of = new Map<MarkerItem, Bunch>();
      for (const b of bunches) {
        const { pill, shape } = LAYER_DEFS[b.group];
        const n = b.ids.length;
        const x = b.sx / n;
        const y = b.sy / n;
        if (n === 1) {
          markers.push({ kind: 'marker', group: b.group, shape, x, y, id: b.ids[0] });
          continue;
        }
        const item: MarkerItem = {
          kind: 'cluster',
          group: b.group,
          shape,
          x,
          y,
          label: pill,
          count: n,
          ids: b.ids,
          anchor: [x, y],
        };
        of.set(item, b);
        pills.push(item);
      }
      pills.sort(
        (a, b) =>
          b.count! - a.count! ||
          order.get(a.group as PoiType)! - order.get(b.group as PoiType)! ||
          a.x - b.x ||
          a.y - b.y,
      );
      const placed = placeMarkers(pills, measure);
      worldItems = [...markers, ...placed.map(({ box, ...item }) => (void box, item))];
      const far = placed
        .map((h, i) => ({ h, b: of.get(pills[i])! }))
        .filter(({ h }) => Math.hypot(h.x - h.anchor[0], h.y - h.anchor[1]) > PILL_MAX_SHIFT);
      if (far.length === 0) break;
      let merged = false;
      for (const { b } of far) {
        const at = bunches.indexOf(b);
        if (at < 0) continue;
        const bx = b.sx / b.ids.length;
        const by = b.sy / b.ids.length;
        let best: Bunch | null = null;
        let bestD = Infinity;
        for (const o of bunches) {
          if (o === b || o.group !== b.group) continue;
          const d = Math.hypot(o.sx / o.ids.length - bx, o.sy / o.ids.length - by);
          if (d < bestD) {
            best = o;
            bestD = d;
          }
        }
        if (!best) continue;
        best.sx += b.sx;
        best.sy += b.sy;
        best.ids = [...best.ids, ...b.ids];
        bunches.splice(at, 1);
        merged = true;
      }
      if (!merged) break;
    }

    const items: MarkerItem[] = [];
    for (const i of worldItems) {
      const x = i.x + view.x;
      const y = i.y + view.y;
      if (!visible(x, y)) continue;
      items.push({
        ...i,
        x,
        y,
        ...(i.anchor ? { anchor: [i.anchor[0] + view.x, i.anchor[1] + view.y] } : {}),
      });
    }
    return items;
  };
}
