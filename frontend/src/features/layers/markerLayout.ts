import type { PoiLayer } from '../../data/types';
import type { MarkerItem, MarkerLayout } from '../map/markerCanvas';
import { clusterPoints, inView } from './cluster';
import { LAYER_DEFS } from './layerDefs';

/** 이 줌 미만이면 종류별 클러스터, 이상이면 개별 마커 */
export const CLUSTER_MAX_Z = 13;
/** 클러스터 격자 칸(px). 알약(`CCTV 128`) 폭에 맞춰 계획 기본값 48보다 넓게 */
export const CLUSTER_PX = 96;
/** 화면 밖 여백(px). 이 밖은 그리지 않는다 */
const MARGIN = 32;

/** 켠(ready) 레이어들 → 지도 상태마다 그릴 마커·클러스터를 만드는 함수 */
export function buildMarkerLayout(layers: PoiLayer[]): MarkerLayout {
  return ({ width, height, zoom, view, project }) => {
    const items: MarkerItem[] = [];
    const visible = (x: number, y: number) => inView(x, y, width, height, MARGIN);
    // 격자를 화면이 아니라 월드 픽셀에 붙여 끌어도 묶음이 바뀌지 않게 한다
    const world = (lng: number, lat: number): [number, number] => {
      const [x, y] = project(lng, lat);
      return [x - view.x, y - view.y];
    };
    for (const layer of layers) {
      const { pill, shape } = LAYER_DEFS[layer.type];
      const group = layer.type;
      if (zoom < CLUSTER_MAX_Z) {
        for (const c of clusterPoints(layer.items, world, CLUSTER_PX)) {
          const x = c.x + view.x;
          const y = c.y + view.y;
          if (!visible(x, y)) continue;
          if (c.count === 1) items.push({ kind: 'marker', group, shape, x, y, id: c.ids[0] });
          else items.push({ kind: 'cluster', group, shape, x, y, label: pill, count: c.count });
        }
      } else {
        for (const p of layer.items) {
          const [x, y] = project(p.lng, p.lat);
          if (visible(x, y)) items.push({ kind: 'marker', group, shape, x, y, id: p.id });
        }
      }
    }
    return items;
  };
}
