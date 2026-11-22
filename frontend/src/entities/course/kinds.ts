/** 코스 종류. 화면은 종류마다 갈라 쓰지 않고 이 표에서 차이를 읽는다 */
export type CourseKind = 'olle' | 'mine';

export interface CourseKindInfo {
  /** 탭 이름 */
  tab: string;
  /** 목록 이름(스크린 리더) */
  listLabel: string;
  /** 상세 주소 */
  href(id: string): string;
  /** /courses/:id 가 이 종류의 코스인지. 내 코스는 따로 /courses/mine/:id 를 쓴다 */
  owns(id: string): boolean;
  /** 사용자가 고치고 지울 수 있는지 */
  editable: boolean;
  /** 목록이 비었을 때 */
  empty: string;
  /** 목록 머리 설명(줄 세우는 기준) */
  help: string;
  /** 목록 위 만들기 버튼 */
  create: { label: string; href: string } | null;
}

const RISK_ORDER =
  '위험 등급이 낮은 코스부터 보여 줘요. 코스 등급은 가장 위험한 구간의 등급이에요.';

export const COURSE_KINDS: Record<CourseKind, CourseKindInfo> = {
  olle: {
    tab: '올레 코스',
    listLabel: '올레 코스 목록',
    href: (id) => `/courses/${id}`,
    owns: (id) => id.startsWith('olle-'),
    editable: false,
    empty: '코스 자료를 준비 중이에요',
    help: RISK_ORDER,
    create: null,
  },
  mine: {
    tab: '내 코스',
    listLabel: '내 코스 목록',
    href: (id) => `/courses/mine/${id}`,
    owns: () => false,
    editable: true,
    empty: '아직 만든 코스가 없어요. 장소를 골라 나만의 코스를 만들어 보세요.',
    help: '최근에 고친 코스부터 보여 줘요. 이 기기에만 저장돼요. 코스 등급은 가장 위험한 구간의 등급이에요.',
    create: { label: '새 코스 만들기', href: '/courses/mine/new' },
  },
};

/** 탭 순서. 첫 탭이 /courses 의 기본 탭 */
export const COURSE_TABS: readonly CourseKind[] = ['olle', 'mine'];
const DEFAULT_TAB = COURSE_TABS[0];

const isKind = (v: string | null): v is CourseKind => v !== null && Object.hasOwn(COURSE_KINDS, v);

/** ?tab= 값 → 탭. 없거나 모르는 값이면 기본 탭 */
export function tabFromSearch(search: URLSearchParams): CourseKind {
  const v = search.get('tab');
  return isKind(v) ? v : DEFAULT_TAB;
}

/** 탭 목록 주소. 기본 탭은 ?tab= 을 붙이지 않는다 */
export function tabHref(kind: CourseKind): string {
  return kind === DEFAULT_TAB ? '/courses' : `/courses?tab=${kind}`;
}

/** /courses/:id 의 코스 종류. 모르는 id면 null */
export function kindOfId(id: string): CourseKind | null {
  return COURSE_TABS.find((k) => COURSE_KINDS[k].owns(id)) ?? null;
}
