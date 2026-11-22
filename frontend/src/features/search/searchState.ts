import type { Candidate } from './localSearch';

/**
 * 내 코스 편집 화면의 장소 찾기 상태. 어느 상태에서도 장소를 코스에 넣지 않는다(넣기는 카드·결과의 버튼만).
 * idle: 편집 화면, suggest: 입력 중 추천 목록, results: 검색 결과 목록(쪽마다 15건),
 * place: 장소 하나를 고른 카드(추천 후보를 고르거나 지도를 누른 곳)
 */
export type SearchState =
  | { mode: 'idle'; query: string }
  | { mode: 'suggest'; query: string; active: number }
  | { mode: 'results'; query: string; page: number; selected: number | null }
  | { mode: 'place'; query: string; place: Candidate };

export type SearchAction =
  | { type: 'type'; query: string }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'move'; by: 1 | -1; count: number }
  /** 입력칸 엔터. 화살표로 고른 추천이 있으면 그 장소 카드, 없으면 검색 */
  | { type: 'enter'; suggestions: readonly Candidate[] }
  /** 검색 버튼 */
  | { type: 'submit' }
  /** 추천 후보를 누름 */
  | { type: 'choose'; place: Candidate }
  /** 지도 빈 곳을 누름 */
  | { type: 'tap'; place: Candidate }
  | { type: 'select'; index: number | null }
  | { type: 'page'; page: number }
  | { type: 'escape' }
  /** ←, 카드 닫기, 장소를 넣은 뒤: 편집 화면으로 */
  | { type: 'close' };

export const IDLE: SearchState = { mode: 'idle', query: '' };

const results = (query: string): SearchState => ({
  mode: 'results',
  query,
  page: 1,
  selected: null,
});

export function searchReducer(s: SearchState, a: SearchAction): SearchState {
  switch (a.type) {
    case 'type':
      return a.query.trim()
        ? { mode: 'suggest', query: a.query, active: -1 }
        : { mode: 'idle', query: a.query };
    case 'focus':
      return s.mode === 'idle' && s.query.trim()
        ? { mode: 'suggest', query: s.query, active: -1 }
        : s;
    case 'blur':
      return s.mode === 'suggest' ? { mode: 'idle', query: s.query } : s;
    case 'move': {
      if (a.count === 0) return s;
      if (s.mode !== 'suggest' && !(s.mode === 'idle' && s.query.trim())) return s;
      const from = s.mode === 'suggest' ? s.active : -1;
      const active = a.by === 1 ? (from + 1) % a.count : from <= 0 ? a.count - 1 : from - 1;
      return { mode: 'suggest', query: s.query, active };
    }
    case 'enter': {
      if (s.mode === 'suggest' && s.active >= 0 && a.suggestions[s.active]) {
        return { mode: 'place', query: s.query, place: a.suggestions[s.active] };
      }
      return s.query.trim() ? results(s.query) : s;
    }
    case 'submit':
      return s.query.trim() ? results(s.query) : s;
    case 'choose':
      return { mode: 'place', query: s.query, place: a.place };
    case 'tap':
      // 검색 결과를 보는 중에는 빈 곳을 눌러도 고른 것만 푼다(결과 표지를 누른 것은 select)
      return s.mode === 'results'
        ? { ...s, selected: null }
        : { mode: 'place', query: '', place: a.place };
    case 'select':
      return s.mode === 'results' ? { ...s, selected: a.index } : s;
    case 'page':
      return s.mode === 'results' ? { ...s, page: a.page, selected: null } : s;
    case 'escape':
      if (s.mode === 'suggest') return { mode: 'idle', query: s.query };
      return s.mode === 'idle' ? s : IDLE;
    case 'close':
      return IDLE;
  }
}
