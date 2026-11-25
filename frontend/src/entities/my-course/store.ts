// 내 코스는 이 기기(localStorage)에만 둔다. localStorage를 읽고 쓰는 곳은 이 파일 하나다.

/** 장소를 어디서 골랐는지 */
export type StopSource = 'map' | 'emd' | 'kakao';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  source: StopSource;
  /** 카카오 장소 번호(카카오에서 고른 장소만) */
  kakaoId?: string;
}

export interface MyCourse {
  id: string;
  name: string;
  stops: Stop[];
  /** ISO 시각 */
  createdAt: string;
  updatedAt: string;
}

/** 코스 하나에 넣을 수 있는 장소 수 */
export const MAX_STOPS = 10;

/** 모양을 바꾸면 버전을 올린다(앞 버전 자료는 읽지 않는다) */
export const STORAGE_KEY = 'jeju-safety.my-courses.v1';

const SOURCES: readonly StopSource[] = ['map', 'emd', 'kakao'];

/**
 * 예전 판에서 고를 수 있던 장소 출처. 그 장소는 좌표·이름이 그대로 쓸모 있으니 코스를 버리지 않고
 * 좌표만 있는 장소(map)로 읽는다
 */
const RETIRED_SOURCES: Readonly<Record<string, StopSource>> = { humanities: 'map' };

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function toStop(v: unknown): Stop | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.name) || !isNum(v.lat) || !isNum(v.lng)) return null;
  const source = isStr(v.source) ? (RETIRED_SOURCES[v.source] ?? v.source) : v.source;
  if (!SOURCES.includes(source as StopSource)) return null;
  const stop: Stop = {
    id: v.id,
    name: v.name,
    lat: v.lat,
    lng: v.lng,
    source: source as StopSource,
  };
  if (isStr(v.kakaoId)) stop.kakaoId = v.kakaoId;
  return stop;
}

function toCourse(v: unknown): MyCourse | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.name) || !Array.isArray(v.stops)) return null;
  if (!isStr(v.createdAt) || !isStr(v.updatedAt)) return null;
  const stops = v.stops.map(toStop);
  if (stops.some((s) => s === null) || stops.length > MAX_STOPS) return null;
  return {
    id: v.id,
    name: v.name,
    stops: stops as Stop[],
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

interface Stored {
  courses: MyCourse[];
  /** 읽지 못한 항목의 원문. 다음 판이나 다른 탭이 쓴 것일 수 있어 쓸 때 그대로 다시 쓴다 */
  unread: unknown[];
}

function parse(raw: string | null): Stored {
  const none: Stored = { courses: [], unread: [] };
  if (!raw) return none;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return none;
  }
  if (!isObj(data) || !Array.isArray(data.courses)) return none;
  const out: Stored = { courses: [], unread: [] };
  for (const item of data.courses) {
    const course = toCourse(item);
    if (course) out.courses.push(course);
    else out.unread.push(item);
  }
  return out;
}

/** 저장된 문자열 → 읽을 수 있는 코스 목록(JSON이 아니거나 모양이 다른 코스는 빠진다) */
export function parseStored(raw: string | null): MyCourse[] {
  return parse(raw).courses;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
let cache: (Stored & { raw: string | null }) | null = null;

function stored(): Stored {
  const raw = storage()?.getItem(STORAGE_KEY) ?? null;
  if (!cache || cache.raw !== raw) cache = { raw, ...parse(raw) };
  return cache;
}

/** 지금 저장된 코스(같은 저장 내용이면 같은 배열) */
export function readCourses(): MyCourse[] {
  return stored().courses;
}

function write(courses: MyCourse[]) {
  const { unread } = stored();
  storage()?.setItem(STORAGE_KEY, JSON.stringify({ courses: [...courses, ...unread] }));
  for (const l of listeners) l();
}

/** 다른 탭에서 바꿔도 알린다 */
export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 새로 저장하거나(id 없음) 고친다. 장소가 MAX_STOPS를 넘으면 던진다 */
export function saveCourse(
  input: { id?: string; name: string; stops: Stop[] },
  now: Date = new Date(),
): MyCourse {
  if (input.stops.length > MAX_STOPS) throw new Error(`장소는 ${MAX_STOPS}곳까지예요`);
  const courses = readCourses();
  const at = now.toISOString();
  const prev = input.id ? courses.find((c) => c.id === input.id) : undefined;
  const course: MyCourse = {
    id: prev?.id ?? input.id ?? newId(),
    name: input.name,
    stops: input.stops,
    createdAt: prev?.createdAt ?? at,
    updatedAt: at,
  };
  write(prev ? courses.map((c) => (c.id === prev.id ? course : c)) : [...courses, course]);
  return course;
}

export function deleteCourse(id: string) {
  write(readCourses().filter((c) => c.id !== id));
}
