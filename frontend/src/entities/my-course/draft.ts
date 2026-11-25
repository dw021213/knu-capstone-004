import { toStops, type Stop } from './store';

// 저장하기 전 만들던 코스는 이 탭(sessionStorage)에 둔다. 새로고침하거나 잘못 떠났다 돌아와도 이어 쓴다.
// 이어 쓰기는 덤이라 sessionStorage를 쓸 수 없으면 조용히 건너뛴다

export interface Draft {
  name: string;
  stops: Stop[];
}

const PREFIX = 'jeju-safety.my-course-draft.v1:';
/** 새 코스는 new, 고치기는 그 코스 id마다 따로 */
const keyOf = (courseId: string | undefined) => PREFIX + (courseId ?? 'new');

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const sameDraft = (a: Draft, b: Draft) =>
  a.name === b.name && JSON.stringify(a.stops) === JSON.stringify(b.stops);

export function readDraft(courseId: string | undefined): Draft | null {
  try {
    const raw = session()?.getItem(keyOf(courseId));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || !('name' in v) || typeof v.name !== 'string') {
      return null;
    }
    const stops = toStops('stops' in v ? v.stops : null);
    return stops ? { name: v.name, stops } : null;
  } catch {
    return null;
  }
}

/** 처음과 같으면 지운다(아무것도 바꾸지 않았는데 불러왔다고 하지 않게) */
export function keepDraft(courseId: string | undefined, draft: Draft, base: Draft) {
  try {
    const s = session();
    if (sameDraft(draft, base)) s?.removeItem(keyOf(courseId));
    else s?.setItem(keyOf(courseId), JSON.stringify(draft));
  } catch {
    // 가득 찼으면 이어 쓰기만 못 한다
  }
}

export function clearDraft(courseId: string | undefined) {
  session()?.removeItem(keyOf(courseId));
}
