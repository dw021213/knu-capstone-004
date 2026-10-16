import { useCallback, useEffect, useState } from 'react';
import type { PoiType } from '../../data/types';

/** 레이어 패널 순서 */
export const LAYER_TYPES: readonly PoiType[] = ['cctv', 'convenience', 'lodging', 'police', 'fire'];

/** localStorage 키. 값은 켠 종류 배열(JSON) */
export const LAYERS_KEY = 'jeju-safety:layers';

const isLayerType = (v: unknown): v is PoiType =>
  typeof v === 'string' && (LAYER_TYPES as readonly string[]).includes(v);

// 사생활 보호 모드·차단된 쿠키에서는 localStorage 접근이 throw한다. 그때는 기억하지 않고 동작만 한다
function load(): Set<PoiType> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LAYERS_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(isLayerType) : []);
  } catch {
    return new Set();
  }
}

function save(on: Set<PoiType>) {
  try {
    window.localStorage.setItem(LAYERS_KEY, JSON.stringify(LAYER_TYPES.filter((t) => on.has(t))));
  } catch {
    // 기억하지 못해도 이번 방문에서는 그대로 쓴다
  }
}

/** 켠 시설 레이어. 처음엔 모두 꺼짐, 다음 방문에도 기억한다 */
export function useLayers(): { on: Set<PoiType>; toggle(t: PoiType): void; count: number } {
  const [on, setOn] = useState(load);
  useEffect(() => save(on), [on]);
  const toggle = useCallback((t: PoiType) => {
    setOn((prev) => {
      const next = new Set(prev);
      if (!next.delete(t)) next.add(t);
      return next;
    });
  }, []);
  return { on, toggle, count: on.size };
}
