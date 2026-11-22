import type { RouteVia } from '../../entities/route/resolve';

/** 장소를 무엇으로 이었는지 화면에 밝히는 문구 */
export const VIA_TEXT: Record<RouteVia, { short: string; note: string; source: string }> = {
  osrm: {
    short: '도로 경로',
    note: '장소 사이를 자동차 도로 길찾기(OSRM)로 이었어요. 걷는 길과 다를 수 있어요.',
    source: '경로: OSRM 자동차 길찾기(© OpenStreetMap 기여자)',
  },
  walk: {
    short: '도보 경로',
    note: '장소 사이를 도보 길찾기로 이었어요.',
    source: '경로: 카카오 도보 길찾기(백엔드 중계)',
  },
  straight: {
    short: '직선 연결',
    note: '길찾기를 하지 못해 장소 사이를 직선으로 이었어요. 실제 길과 달라 등급이 맞지 않을 수 있어요.',
    source: '경로: 직선 연결(길찾기 실패)',
  },
};
