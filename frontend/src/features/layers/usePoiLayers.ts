import { useQueries } from '@tanstack/react-query';
import type { DataSource, PoiLayer, PoiType } from '../../data/types';
import { LAYER_TYPES } from './useLayers';

export type LayerState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'pending'; layer: PoiLayer }
  | { status: 'ready'; layer: PoiLayer };

/**
 * 켠 종류만 받는다(처음 켤 때 한 번). 껐다 켜면 받아 둔 것을 쓴다.
 * 받아 보니 pending이면 그 상태를 돌려줘 패널이 '준비 중'으로 막는다.
 */
export function usePoiLayers(source: DataSource, on: Set<PoiType>): Record<PoiType, LayerState> {
  const results = useQueries({
    queries: LAYER_TYPES.map((type) => ({
      queryKey: ['poi', source.mode, type],
      queryFn: () => source.getPoi(type),
      enabled: on.has(type),
    })),
  });
  const out = {} as Record<PoiType, LayerState>;
  LAYER_TYPES.forEach((type, i) => {
    const q = results[i];
    if (q.data) out[type] = { status: q.data.status, layer: q.data };
    else if (q.isError) out[type] = { status: 'error' };
    else out[type] = on.has(type) ? { status: 'loading' } : { status: 'idle' };
  });
  return out;
}
