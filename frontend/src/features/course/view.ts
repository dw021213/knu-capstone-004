import type { CourseKind } from '../../entities/course/kinds';
import type { CourseSummary } from '../../entities/course/summary';
import type { RouteVia } from '../../entities/route/resolve';

/** 받는 중·실패·자료 없음·준비됨. 코스 목록과 상세가 같이 쓴다 */
export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; retry(): void }
  | { status: 'pending' }
  | ({ status: 'ready' } & T);

/** 목록 한 줄 */
export interface CourseListItem {
  summary: CourseSummary;
  href: string;
  /** 길이 앞에 붙일 짧은 정보(장소 수, 직선 연결) */
  meta: string[];
}

/** 출처 한 줄. href가 있으면 링크 */
export interface SourceNote {
  /** 앞에 붙는 말(경로, 출처) */
  label: string;
  text: string;
  href?: string;
}

export type CourseListState = Loadable<{ items: CourseListItem[]; source: SourceNote | null }>;

/** 상세 장소 목록 한 줄 */
export interface StopView {
  key: string;
  name: string;
  /** [경도, 위도] */
  lngLat: [number, number];
}

/** 상세 화면이 그리는 것. 종류마다 다른 점은 값으로 담는다(장소 목록이 없으면 stops: null) */
export interface CourseView {
  kind: CourseKind;
  summary: CourseSummary;
  stops: StopView[] | null;
  /** 장소를 무엇으로 이었는지(내 코스). 정해진 경로 파일을 쓰면 null */
  via: RouteVia | null;
  /** 출처 칩 */
  sources: string[];
  /** 제목 아래 한 줄(예시 코스: 원래 표의 일차 제목) */
  subtitle: string | null;
  /** 원래 자료에서 바꾸거나 뺀 것(예시 코스) */
  note: string | null;
}

export type CourseDetailState = Loadable<{ view: CourseView }> | { status: 'missing' };
