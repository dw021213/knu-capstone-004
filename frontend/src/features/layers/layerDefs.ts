import type { PoiType } from '../../data/types';
import type { MarkerShape } from '../map/markerShapes';

export interface LayerDef {
  /** 패널 행 이름, 카드 종류 */
  name: string;
  /** 패널 행 설명(왜 보여 주는지) */
  desc: string;
  /** 패널 행의 짧은 출처. 자세한 출처는 시설 카드와 docs/DATA_SOURCES.md */
  source: string;
  /** 클러스터 알약 글자(`CCTV 128`) */
  pill: string;
  shape: MarkerShape;
}

// 경찰·119 좌표는 OpenStreetMap Nominatim으로 얻어 ODbL 표기를 함께 한다(docs/DATA_SOURCES.md)
export const LAYER_DEFS: Record<PoiType, LayerDef> = {
  cctv: {
    name: 'CCTV',
    desc: '방범·교통 카메라',
    source: '행정안전부, 2020년 기준 일부',
    pill: 'CCTV',
    shape: 'square',
  },
  convenience: {
    name: '편의점',
    desc: '밤늦게 도움 요청',
    source: '소상공인시장진흥공단, 2026년 6월',
    pill: '편의점',
    shape: 'circle',
  },
  lodging: {
    name: '숙박',
    desc: '호텔·모텔',
    source: '소상공인시장진흥공단, 2026년 6월',
    pill: '숙박',
    shape: 'house',
  },
  police: {
    name: '경찰',
    desc: '지구대·파출소',
    source: '경찰청, 2025년 12월 기준',
    pill: '경찰',
    shape: 'diamond',
  },
  fire: {
    name: '119안전센터',
    desc: '화재·구급 출동',
    source: '소방청',
    pill: '119',
    shape: 'triangle',
  },
};

/** 좌표를 OpenStreetMap에서 얻은 종류 */
export const OSM_COORDS: ReadonlySet<PoiType> = new Set(['police', 'fire']);
