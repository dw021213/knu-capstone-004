import { useQueries, useQuery } from '@tanstack/react-query';
import type { DataSource, EmergencyList, PoiType } from '../../data/types';
import type { EmdFile } from '../../entities/place/emd';
import { LAYER_TYPES } from '../layers/useLayers';
import type { LayerState } from '../layers/usePoiLayers';

export type EmergencyState =
  { status: 'loading' } | { status: 'error' } | { status: 'done'; list: EmergencyList };

export interface SheetData {
  /** 5종 시설(레이어 켜짐과 무관) */
  facilities: Record<PoiType, LayerState>;
  emergency: EmergencyState;
  emd: EmdFile | null;
}

async function fetchEmd(): Promise<EmdFile> {
  const res = await fetch('/data/emd.json');
  if (!res.ok) throw new Error(`읍면동 파일 응답 ${res.status}`);
  return (await res.json()) as EmdFile;
}

/**
 * 셀 시트에 필요한 자료. 시트를 처음 열 때 받는다(레이어와 같은 queryKey라 한 번만 받는다).
 * enabled가 false여도 받아 둔 것은 그대로 돌려준다.
 */
export function useSheetData(source: DataSource, enabled: boolean): SheetData {
  const results = useQueries({
    queries: LAYER_TYPES.map((type) => ({
      queryKey: ['poi', source.mode, type],
      queryFn: () => source.getPoi(type),
      enabled,
    })),
  });
  const er = useQuery({
    queryKey: ['emergency', source.mode],
    queryFn: () => source.getEmergency(),
    enabled,
  });
  const emd = useQuery({ queryKey: ['emd'], queryFn: fetchEmd, enabled });

  const facilities = {} as Record<PoiType, LayerState>;
  LAYER_TYPES.forEach((type, i) => {
    const q = results[i];
    if (q.data) facilities[type] = { status: q.data.status, layer: q.data };
    else if (q.isError) facilities[type] = { status: 'error' };
    else facilities[type] = enabled ? { status: 'loading' } : { status: 'idle' };
  });
  const emergency: EmergencyState = er.data
    ? { status: 'done', list: er.data }
    : er.isError
      ? { status: 'error' }
      : { status: 'loading' };
  return { facilities, emergency, emd: emd.data ?? null };
}
