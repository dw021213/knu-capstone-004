import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  KAKAO_MAX_PAGE,
  KAKAO_PAGE_SIZE,
  kakaoStatus,
  searchKakao,
  subscribeKakao,
  type KakaoPlace,
} from './kakao';
import { searchLocal, type Candidate } from './localSearch';

/** 추천 목록 최대 줄 수 */
export const SUGGEST_LIMIT = 8;
/** 추천 목록에서 내장 목록(읍면동)이 먼저 차지하는 줄 수(카카오를 쓸 수 있을 때) */
const SUGGEST_LOCAL = 3;
const DEBOUNCE_MS = 250;
const KAKAO_MIN = 2;

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** 카카오 장소 검색을 쓸 수 있는지(키가 있고 아직 실패하지 않음) */
export function useKakaoOn() {
  const s = useSyncExternalStore(subscribeKakao, kakaoStatus);
  return s !== 'off' && s !== 'failed';
}

const fromKakao = (p: KakaoPlace): Candidate => ({
  key: `kakao-${p.id}`,
  name: p.name,
  category: p.category || '장소',
  address: p.address,
  lat: p.lat,
  lng: p.lng,
  source: 'kakao',
});

// 추천과 검색 결과 1쪽이 같은 요청을 나눠 쓴다(추천을 본 뒤 엔터를 치면 바로 결과가 뜬다)
const kakaoQuery = (query: string, page: number, enabled: boolean) => ({
  queryKey: ['kakao-places', query, page],
  queryFn: () => searchKakao(query, page),
  enabled: enabled && query.length >= KAKAO_MIN,
  staleTime: Infinity,
  retry: false,
});

/** 입력 중 추천: 250ms 멈추면 내장 목록 + 카카오 1쪽 앞부분 */
export function useSuggestions(local: readonly Candidate[], query: string, open: boolean) {
  const q = query.trim();
  const typed = useDebounced(q, DEBOUNCE_MS);
  const kakaoOn = useKakaoOn();
  const remote = useQuery(kakaoQuery(typed, 1, open && kakaoOn));
  if (!open || !q) return { items: [] as Candidate[], loading: false };
  const settled = typed === q;
  const localHits = searchLocal(local, q, kakaoOn ? SUGGEST_LOCAL : SUGGEST_LIMIT);
  const remoteHits = settled ? (remote.data?.places ?? []).map(fromKakao) : [];
  const items = [...localHits, ...remoteHits].slice(0, SUGGEST_LIMIT);
  const loading = kakaoOn && q.length >= KAKAO_MIN && (!settled || remote.isFetching);
  return { items, loading };
}

export interface Results {
  items: Candidate[];
  /** 전체 결과 수 */
  total: number;
  /** 카카오가 넘겨 주는 상한(45건)에 닿아 실제로는 더 있을 수 있음 */
  capped: boolean;
  /** 넘길 수 있는 마지막 쪽 */
  pages: number;
  loading: boolean;
}

/**
 * 검색 결과 page쪽. 카카오를 쓸 수 있으면 카카오 결과(제주 범위, 쪽마다 15건), 못 쓰거나 카카오 결과가 없으면
 * 내장 목록(읍면동)에서 찾은 것 한 쪽
 */
export function useResults(
  local: readonly Candidate[],
  query: string | null,
  page: number,
): Results {
  const q = query?.trim() ?? '';
  const kakaoOn = useKakaoOn();
  const remote = useQuery(kakaoQuery(q, page, query !== null && kakaoOn));
  if (!q) return { items: [], total: 0, capped: false, pages: 1, loading: false };
  const localHits = searchLocal(local, q, KAKAO_PAGE_SIZE);
  if (kakaoOn && q.length >= KAKAO_MIN) {
    if (!remote.data) return { items: [], total: 0, capped: false, pages: 1, loading: true };
    const { places, total } = remote.data;
    if (places.length > 0 || page > 1) {
      const pages = Math.min(KAKAO_MAX_PAGE, Math.max(1, Math.ceil(total / KAKAO_PAGE_SIZE)));
      // 카카오 SDK의 totalCount는 실제 수가 아니라 넘겨 줄 수 있는 수(최대 45)다
      const capped = total >= KAKAO_PAGE_SIZE * KAKAO_MAX_PAGE;
      return { items: places.map(fromKakao), total, capped, pages, loading: false };
    }
  }
  return { items: localHits, total: localHits.length, capped: false, pages: 1, loading: false };
}
