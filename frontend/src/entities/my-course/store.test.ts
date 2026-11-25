import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addBlock, addStop, moveStop, removeStop, stopRole } from './stops';
import {
  MAX_STOPS,
  STORAGE_KEY,
  deleteCourse,
  parseStored,
  readCourses,
  saveCourse,
  subscribe,
  type Stop,
} from './store';

const stop = (i: number): Stop => ({
  id: `s${i}`,
  name: `장소 ${i}`,
  lat: 33.4 + i * 0.01,
  lng: 126.5,
  source: 'map',
});

beforeEach(() => localStorage.clear());

describe('저장소', () => {
  it('저장한 코스를 다시 읽고, 고치면 만든 시각은 두고 고친 시각만 바뀐다', () => {
    const a = saveCourse(
      { name: '첫 코스', stops: [stop(1), stop(2)] },
      new Date('2026-11-23T01:00:00Z'),
    );
    expect(readCourses()).toEqual([a]);
    const b = saveCourse(
      { id: a.id, name: '고친 코스', stops: [stop(2), stop(1)] },
      new Date('2026-11-23T02:00:00Z'),
    );
    expect(readCourses()).toHaveLength(1);
    expect(b.createdAt).toBe('2026-11-23T01:00:00.000Z');
    expect(b.updatedAt).toBe('2026-11-23T02:00:00.000Z');
    expect(readCourses()[0].stops.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('여러 코스를 두고 하나를 지울 수 있다', () => {
    const a = saveCourse({ name: 'A', stops: [stop(1)] });
    const b = saveCourse({ name: 'B', stops: [stop(2)] });
    expect(readCourses().map((c) => c.name)).toEqual(['A', 'B']);
    deleteCourse(a.id);
    expect(readCourses().map((c) => c.id)).toEqual([b.id]);
  });

  it('장소가 10곳을 넘으면 저장하지 않는다', () => {
    const eleven = Array.from({ length: MAX_STOPS + 1 }, (_, i) => stop(i));
    expect(() => saveCourse({ name: 'x', stops: eleven })).toThrow();
    expect(readCourses()).toEqual([]);
    saveCourse({ name: 'ten', stops: eleven.slice(0, MAX_STOPS) });
    expect(readCourses()[0].stops).toHaveLength(MAX_STOPS);
  });

  it('바뀌면 구독자에게 알린다', () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    saveCourse({ name: 'A', stops: [] });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    saveCourse({ name: 'B', stops: [] });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('같은 저장 내용이면 같은 배열을 돌려준다(화면이 다시 그리지 않게)', () => {
    saveCourse({ name: 'A', stops: [] });
    expect(readCourses()).toBe(readCourses());
  });
});

describe('깨진 자료', () => {
  it('JSON이 아니거나 모양이 다르면 빈 목록', () => {
    expect(parseStored(null)).toEqual([]);
    expect(parseStored('{not json')).toEqual([]);
    expect(parseStored('[]')).toEqual([]);
    expect(parseStored('{"courses": 3}')).toEqual([]);
  });

  it('모양이 틀린 코스만 버리고 나머지는 읽는다', () => {
    const good = {
      id: 'g',
      name: '좋은 코스',
      stops: [stop(1)],
      createdAt: '2026-11-23T00:00:00.000Z',
      updatedAt: '2026-11-23T00:00:00.000Z',
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        courses: [
          good,
          { ...good, id: 'no-dates', createdAt: undefined },
          { ...good, id: 'bad-stop', stops: [{ ...stop(1), lat: 'x' }] },
          { ...good, id: 'bad-source', stops: [{ ...stop(1), source: 'gps' }] },
          { ...good, id: 'too-many', stops: Array.from({ length: 11 }, (_, i) => stop(i)) },
          'x',
        ],
      }),
    );
    expect(readCourses().map((c) => c.id)).toEqual(['g']);
  });

  it('예전 판의 인문학 코스 장소는 코스를 버리지 않고 좌표만 있는 장소로 읽는다', () => {
    const old = {
      id: 'old',
      name: '예전 코스',
      stops: [
        { ...stop(1), source: 'humanities' },
        { ...stop(2), source: 'kakao' },
      ],
      createdAt: '2026-11-22T00:00:00.000Z',
      updatedAt: '2026-11-22T00:00:00.000Z',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ courses: [old] }));
    const [course] = readCourses();
    expect(course.id).toBe('old');
    expect(course.stops.map((s) => [s.name, s.source])).toEqual([
      ['장소 1', 'map'],
      ['장소 2', 'kakao'],
    ]);
  });

  it('localStorage를 쓸 수 없어도(사생활 보호 모드) 빈 목록으로 동작한다', () => {
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readCourses()).toEqual([]);
    spy.mockRestore();
  });
});

describe('장소 순서', () => {
  const three = [stop(1), stop(2), stop(3)];

  it('위·아래로 한 칸씩 옮기고 끝을 넘으면 그대로', () => {
    expect(moveStop(three, 1, -1).map((s) => s.id)).toEqual(['s2', 's1', 's3']);
    expect(moveStop(three, 1, 1).map((s) => s.id)).toEqual(['s1', 's3', 's2']);
    expect(moveStop(three, 0, -1).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(moveStop(three, 2, 1).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('10곳이 차면 더하지 않고, 지우면 그 장소만 빠진다', () => {
    const ten = Array.from({ length: MAX_STOPS }, (_, i) => stop(i));
    expect(addStop(ten, stop(99))).toHaveLength(MAX_STOPS);
    expect(addStop(three, stop(4)).map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(removeStop(three, 's2').map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('바로 앞 장소와 같은 곳(20m 안)은 연달아 더하지 않고, 사이에 다른 장소가 있으면 더한다', () => {
    const near = { ...stop(3), id: 'near', lat: stop(3).lat + 0.0001 };
    const far = { ...stop(3), id: 'far', lat: stop(3).lat + 0.001 };
    expect(addBlock(three, near)).toBe('repeat');
    expect(addStop(three, near).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(addBlock(three, far)).toBeNull();
    expect(addBlock(three, stop(1))).toBeNull();
    expect(
      addBlock(
        Array.from({ length: MAX_STOPS }, (_, i) => stop(i)),
        far,
      ),
    ).toBe('full');
  });

  it('줄 이름표는 출발, 경유 1·2…, 도착', () => {
    expect([0, 1, 2, 3].map((i) => stopRole(i, 4))).toEqual(['출발', '경유 1', '경유 2', '도착']);
    expect(stopRole(0, 1)).toBe('출발');
  });
});
