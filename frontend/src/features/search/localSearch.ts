import type { StopSource } from '../../entities/my-course/store';

/** 고를 수 있는 장소 하나(추천 줄, 검색 결과 줄, 장소 카드) */
export interface Candidate {
  key: string;
  name: string;
  /** 분류(예: 공항, 읍면동) */
  category: string;
  /** 주소(도로명, 없으면 지번). 읍면동은 시 이름 */
  address: string;
  lat: number;
  lng: number;
  source: StopSource;
  /** 카카오 장소 번호(카카오 결과만) */
  kakaoId?: string;
}

/** 줄 아래 작은 글자: 분류 · 주소 */
export const metaText = (c: Candidate) => [c.category, c.address].filter(Boolean).join(' · ');

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 내장 목록에서 이름 일부로 찾는다. 이름 앞이 맞는 것을 먼저 */
export function searchLocal(list: readonly Candidate[], query: string, limit: number) {
  const q = squash(query);
  if (!q) return [];
  const scored: [number, number, Candidate][] = [];
  list.forEach((c, i) => {
    const name = squash(c.name);
    if (name.startsWith(q)) scored.push([0, i, c]);
    else if (name.includes(q)) scored.push([1, i, c]);
  });
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(([, , c]) => c);
}

/** 이름에서 검색어와 맞는 부분 [시작, 끝). 대소문자는 가리지 않는다. 없으면 null */
export function matchRange(name: string, query: string): [number, number] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const i = name.toLowerCase().indexOf(q);
  return i < 0 ? null : [i, i + q.length];
}
