// 회사(산학 멘토)에서 받은 인문학 코스 표 중 두 일차만 예시로 싣는다. 장소와 순서는 확정 전 초안이다.
// 좌표와 이름은 feat/frontend-humanities-data 의 data-src/humanities/places.json(카카오 로컬 키워드 검색,
// 2026-11-23)에서 그대로 옮겼다. 정확한 지점이 아니라 그 장소 일대를 가리킨다.
import { newId, type Stop } from '../my-course/store';

export interface ExampleStop {
  name: string;
  lat: number;
  lng: number;
}

/** 내 코스와 같은 모양(name, stops)에 원래 표의 제목·일차·출처 메모를 더한다 */
export interface ExampleCourse {
  id: string;
  /** 목록·상세 제목. 내 코스로 가져오면 이 이름을 쓴다 */
  name: string;
  /** 원래 표의 코스 제목 */
  title: string;
  day: number;
  /** 원래 표의 일차 제목 */
  dayTitle: string;
  stops: ExampleStop[];
  /** 원래 표에서 바꾸거나 뺀 것 */
  note: string;
}

export const EXAMPLE_SOURCES = [
  '코스: 회사에서 받은 인문학 코스 초안(2026-11-02)',
  '장소: 카카오 로컬 검색(2026-11-23)',
] as const;

export const EXAMPLE_COURSES: readonly ExampleCourse[] = [
  {
    id: 'hum-01-day2',
    name: '유배 코스 2일차',
    title: '유배 코스',
    day: 2,
    dayTitle: '남부의 유배 흔적과 자연',
    stops: [
      { name: '성읍 정의현성', lat: 33.391729, lng: 126.80095 },
      { name: '천지연폭포', lat: 33.244742, lng: 126.559696 },
      { name: '외돌개', lat: 33.239034, lng: 126.544862 },
      { name: '이중섭거리', lat: 33.247614, lng: 126.564004 },
      { name: '서복공원·서복전시관', lat: 33.244862, lng: 126.570887 },
      { name: '정방폭포', lat: 33.244909, lng: 126.571526 },
    ],
    note: '표의 외돌개 다음 ‘황우지 해안’은 카카오 지도에 폐쇄로 나와 이 예시에서 뺐어요.',
  },
  {
    id: 'hum-05-day2',
    name: '여성 코스 2일차',
    title: '여성 코스',
    day: 2,
    dayTitle: '숲과 생명의 길',
    stops: [
      { name: '비자림', lat: 33.490408, lng: 126.809988 },
      { name: '다랑쉬오름', lat: 33.477686, lng: 126.821536 },
      { name: '산굼부리', lat: 33.432574, lng: 126.693832 },
      { name: '삼다수 숲길', lat: 33.421585, lng: 126.666539 },
      { name: '제주돌문화공원', lat: 33.448562, lng: 126.660273 },
      { name: '한라생태숲', lat: 33.431293, lng: 126.5977 },
      { name: '제주국제공항', lat: 33.50684, lng: 126.492723 },
    ],
    note: '표의 마지막 ‘공항’은 제주국제공항으로 넣었어요.',
  },
];

export const findExample = (id: string) => EXAMPLE_COURSES.find((c) => c.id === id) ?? null;

/** 내 코스로 가져올 장소: 새 id를 붙이고 카카오 로컬 검색에서 온 장소로 둔다 */
export function exampleStops(course: ExampleCourse): Stop[] {
  return course.stops.map((s) => ({ id: newId(), ...s, source: 'kakao' }));
}
