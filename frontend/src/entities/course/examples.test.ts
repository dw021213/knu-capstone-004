import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_STOPS, readCourses, saveCourse } from '../my-course/store';
import { addBlock } from '../my-course/stops';
import { EXAMPLE_COURSES, exampleStops, findExample } from './examples';

beforeEach(() => localStorage.clear());

describe('예시 코스 읽기', () => {
  it('유배 코스 2일차와 여성 코스 2일차 두 개, 장소 순서는 표 그대로(황우지 해안만 뺀다)', () => {
    expect(EXAMPLE_COURSES.map((c) => [c.id, c.name, c.dayTitle])).toEqual([
      ['hum-01-day2', '유배 코스 2일차', '남부의 유배 흔적과 자연'],
      ['hum-05-day2', '여성 코스 2일차', '숲과 생명의 길'],
    ]);
    expect(findExample('hum-01-day2')!.stops.map((s) => s.name)).toEqual([
      '성읍 정의현성',
      '천지연폭포',
      '외돌개',
      '이중섭거리',
      '서복공원·서복전시관',
      '정방폭포',
    ]);
    expect(findExample('hum-05-day2')!.stops.map((s) => s.name)).toEqual([
      '비자림',
      '다랑쉬오름',
      '산굼부리',
      '삼다수 숲길',
      '제주돌문화공원',
      '한라생태숲',
      '제주국제공항',
    ]);
    expect(findExample('hum-03')).toBeNull();
  });

  it('장소는 제주 안이고 내 코스로 넣을 수 있는 수와 간격이다', () => {
    for (const c of EXAMPLE_COURSES) {
      expect(c.stops.length).toBeLessThanOrEqual(MAX_STOPS);
      for (const s of c.stops) {
        expect(s.lat).toBeGreaterThan(33.1);
        expect(s.lat).toBeLessThan(33.6);
        expect(s.lng).toBeGreaterThan(126.1);
        expect(s.lng).toBeLessThan(127);
      }
      // 바로 앞 장소와 같은 곳(20m 안)이 없어 가져와 고칠 때 막히지 않는다
      const stops = exampleStops(c);
      stops.forEach((s, i) => expect(addBlock(stops.slice(0, i), s)).toBeNull());
    }
  });
});

describe('내 코스로 가져오기', () => {
  it('이름과 장소(이름·좌표)를 그대로 복사하고, 장소마다 새 id와 카카오 출처를 붙인다', () => {
    const ex = EXAMPLE_COURSES[0];
    const saved = saveCourse({ name: ex.name, stops: exampleStops(ex) });
    const [mine] = readCourses();
    expect(mine).toEqual(saved);
    expect(mine.name).toBe('유배 코스 2일차');
    expect(mine.stops.map(({ name, lat, lng }) => ({ name, lat, lng }))).toEqual(ex.stops);
    expect(mine.stops.every((s) => s.source === 'kakao')).toBe(true);
    expect(new Set(mine.stops.map((s) => s.id)).size).toBe(ex.stops.length);
    // 예시 원본은 그대로
    expect(ex.stops[0]).not.toHaveProperty('id');
  });
});
