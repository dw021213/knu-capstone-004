/** 코스 종류. 화면은 종류마다 갈라 쓰지 않고 이 표에서 차이를 읽는다 */
export type CourseKind = 'olle' | 'mine' | 'example';

/** 코스 화면 탭. 한 탭에 여러 종류가 묶음으로 보일 수 있다 */
export type CourseTab = 'olle' | 'mine';

export interface CourseKindInfo {
  /** 이 종류가 보이는 탭 */
  tab: CourseTab;
  /** 탭 안 묶음 제목. null이면 탭 이름이 곧 제목 */
  heading: string | null;
  /** 목록 이름(스크린 리더) */
  listLabel: string;
  /** 상세 주소 */
  href(id: string): string;
  /** /courses/:id 가 이 종류의 코스인지. 내 코스·예시 코스는 따로 주소를 쓴다 */
  owns(id: string): boolean;
  /** 목록이 비었을 때 */
  empty: string;
  /** 목록 줄 이름 옆 표지 */
  tag: string | null;
  /** 묶음 머리와 상세 위에 띄우는 안내 */
  notice: string | null;
}

export interface CourseTabInfo {
  label: string;
  /** 목록 머리 설명 */
  help: string;
  /** 목록 위 만들기 버튼 */
  create: { label: string; href: string } | null;
}

const COLOR_HELP =
  '코스가 지나는 구간의 위험 등급을 색으로 보여 줘요. 빨간 구간에서는 조금 더 유의해 주세요.';

export const COURSE_KINDS: Record<CourseKind, CourseKindInfo> = {
  olle: {
    tab: 'olle',
    heading: null,
    listLabel: '올레 코스 목록',
    href: (id) => `/courses/${id}`,
    owns: (id) => id.startsWith('olle-'),
    empty: '코스 자료를 준비 중이에요',
    tag: null,
    notice: null,
  },
  mine: {
    tab: 'mine',
    heading: null,
    listLabel: '내 코스 목록',
    href: (id) => `/courses/mine/${id}`,
    owns: () => false,
    empty: '아직 만든 코스가 없어요. 장소를 골라 나만의 코스를 만들어 보세요.',
    tag: null,
    notice: null,
  },
  example: {
    tab: 'mine',
    heading: '예시 코스',
    listLabel: '예시 코스 목록',
    href: (id) => `/courses/examples/${id}`,
    owns: () => false,
    empty: '예시 코스가 없어요',
    tag: '예시 · 확정 전',
    notice:
      '회사에서 받은 인문학 코스 초안을 임시로 넣은 예시예요. 장소와 순서는 확정 전이라 바뀔 수 있어요.',
  },
};

/** 탭 안 묶음 순서(위에서 아래로) */
const KIND_ORDER: readonly CourseKind[] = ['olle', 'mine', 'example'];

export const COURSE_TABS: Record<CourseTab, CourseTabInfo> = {
  olle: { label: '올레 코스', help: COLOR_HELP, create: null },
  mine: {
    label: '내 코스',
    help: `${COLOR_HELP} 내 코스는 최근에 고친 코스부터 보여 주고 이 기기에만 저장돼요.`,
    create: { label: '새 코스 만들기', href: '/courses/mine/new' },
  },
};

/** 탭 순서. 첫 탭이 /courses 의 기본 탭 */
export const TAB_ORDER: readonly CourseTab[] = ['olle', 'mine'];
const DEFAULT_TAB = TAB_ORDER[0];

/** 탭에 보이는 코스 종류 */
export const kindsOfTab = (tab: CourseTab) => KIND_ORDER.filter((k) => COURSE_KINDS[k].tab === tab);

const isTab = (v: string | null): v is CourseTab => v !== null && Object.hasOwn(COURSE_TABS, v);

/** ?tab= 값 → 탭. 없거나 모르는 값이면 기본 탭 */
export function tabFromSearch(search: URLSearchParams): CourseTab {
  const v = search.get('tab');
  return isTab(v) ? v : DEFAULT_TAB;
}

/** 탭 목록 주소. 기본 탭은 ?tab= 을 붙이지 않는다 */
export function tabHref(tab: CourseTab): string {
  return tab === DEFAULT_TAB ? '/courses' : `/courses?tab=${tab}`;
}

/** /courses/:id 의 코스 종류. 모르는 id면 null */
export function kindOfId(id: string): CourseKind | null {
  return KIND_ORDER.find((k) => COURSE_KINDS[k].owns(id)) ?? null;
}
