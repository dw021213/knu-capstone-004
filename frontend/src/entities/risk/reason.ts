import type { PoiType, RoadSource, Scores } from '../../data/types';
import { LEVEL_NAME, type Level } from './level';

export interface ReasonInput {
  level: Level | null;
  /** 교통 모델 백분위(0~100). 데이터 부족이면 null */
  percentile: number | null;
  roadSource: RoadSource;
  /** 받은 종류만 넣는다. 빠진 종류는 문장에서 말하지 않는다 */
  nearby: Partial<Record<PoiType, { r300: number }>>;
  /** api 모드의 기상 가산 상태. snapshot은 off(문장 없음) */
  weather?: Scores['weather'];
  /** 근거 문장에 쓴 시설의 출처 칩 */
  poiSources?: string[];
}

export interface Reason {
  headline: string;
  body: string;
  sources: string[];
}

const MODEL_SOURCE = '교통사고 도로 모델(2017~2021 사고 자료)';
const ROAD_SOURCE: Partial<Record<RoadSource, string>> = {
  standard_link: '표준노드링크 2026-09-14',
  ngii_map: '수치지도 2025',
};
const WEATHER_SOURCE = '기상청 AWS 관측';

const ADVERB: Record<Level, string> = {
  5: '매우 높게',
  4: '높게',
  3: '보통으로',
  2: '낮게',
  1: '매우 낮게',
};

/** 시설 이름(문장 순서). 받침 여부에 따라 조사가 다르다 */
const FACILITY: { type: PoiType; name: string; topic: string; and: string }[] = [
  { type: 'cctv', name: 'CCTV', topic: '는', and: '와' },
  { type: 'convenience', name: '편의점', topic: '은', and: '과' },
  { type: 'lodging', name: '숙박시설', topic: '은', and: '과' },
  { type: 'police', name: '경찰 지구대·파출소', topic: '는', and: '와' },
  { type: 'fire', name: '119안전센터', topic: '는', and: '와' },
];
/** 0곳일 때 '자료에 없어요'라고 말하는 종류. 시설 자료가 실제보다 적을 수 있어 '없어요'로 단정하지 않는다 */
const MENTION_ABSENT: ReadonlySet<PoiType> = new Set(['cctv', 'convenience']);

function facilitySentence(nearby: ReasonInput['nearby']): string | null {
  const present: string[] = [];
  const absent: (typeof FACILITY)[number][] = [];
  for (const f of FACILITY) {
    const n = nearby[f.type]?.r300;
    if (n === undefined) continue;
    if (n > 0) present.push(`${f.name} ${n}곳`);
    else if (MENTION_ABSENT.has(f.type)) absent.push(f);
  }
  const none = absent.map((f, i) => f.name + (i < absent.length - 1 ? f.and : f.topic)).join(' ');
  if (present.length > 0 && absent.length > 0)
    return `반경 300m 안에 ${present.join(', ')}이 있고 ${none} 자료에 없어요.`;
  if (present.length > 0) return `반경 300m 안에 ${present.join(', ')}이 있어요.`;
  if (absent.length > 0) return `반경 300m 안에 ${none} 자료에 없어요.`;
  return null;
}

/** 구조화된 값(교통 모델 백분위, 도로 출처, 주변 시설 수, 기상 상태)만으로 셀 시트 근거 문장을 만든다 */
export function buildReason({
  level,
  percentile,
  roadSource,
  nearby,
  weather = 'off',
  poiSources = [],
}: ReasonInput): Reason {
  if (level === null || percentile === null) {
    return {
      headline: '데이터 부족',
      body: '이 셀은 도로 자료가 확인되지 않아 위험도를 계산하지 않았어요. 위험하지 않다는 뜻은 아니에요.',
      sources: [MODEL_SOURCE, ...poiSources],
    };
  }
  const top = Math.max(1, Math.round(100 - percentile));
  const island = roadSource === 'ngii_map';
  const parts = [
    `도로가 있는 제주 격자 중 상위 ${top}% 안에 드는 곳이에요.`,
    island
      ? `도로 길이와 밀도로 본 교통사고 위험이 ${ADVERB[level]} 나왔어요.`
      : `도로 구조(차로 수, 제한속도, 교차로)로 본 교통사고 위험이 ${ADVERB[level]} 나왔어요.`,
  ];
  if (island) parts.push('섬 지역 수치지도 도로로 계산했어요.');
  if (weather === 'on') parts.push('관측 날씨 가산이 들어간 값이에요.');
  if (weather === 'no_data') parts.push('이 시각 관측 날씨가 없어 날씨 가산은 들어가지 않았어요.');
  const facility = facilitySentence(nearby);
  if (facility) parts.push(facility);

  const sources = [MODEL_SOURCE];
  const road = ROAD_SOURCE[roadSource];
  if (road) sources.push(road);
  if (weather === 'on') sources.push(WEATHER_SOURCE);
  sources.push(...poiSources);
  return { headline: `${level} · ${LEVEL_NAME[level]}`, body: parts.join(' '), sources };
}
