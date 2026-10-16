// 날짜는 모두 서울 기준 'YYYY-MM-DD' 문자열로 다룬다. 브라우저 시간대에 기대지 않는다.

const KST = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 서울의 지금 날짜와 시(0~23) */
export function kstNow(now: Date = new Date()): { date: string; hour: number } {
  const p = Object.fromEntries(KST.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

function parts(d: string): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number);
  return [y, m, day];
}

const iso = (t: Date) =>
  `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;

export function addDays(d: string, n: number): string {
  const [y, m, day] = parts(d);
  return iso(new Date(Date.UTC(y, m - 1, day + n)));
}

/** 0 = 일요일 */
export function weekday(d: string): number {
  const [y, m, day] = parts(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

/** '10월 20일' */
export function shortLabel(d: string): string {
  const [, m, day] = parts(d);
  return `${m}월 ${day}일`;
}

/** '10월 20일 (화)' */
export function chipLabel(d: string): string {
  return `${shortLabel(d)} (${WEEKDAY[weekday(d)]})`;
}

export const WEEKDAY_NAMES = WEEKDAY;

/** 일요일부터 채운 달력 칸. 1일 앞 빈칸은 null */
export function monthCells(year: number, month: number): (string | null)[] {
  const first = iso(new Date(Date.UTC(year, month - 1, 1)));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: weekday(first) }, () => null);
  for (let i = 0; i < days; i++) cells.push(addDays(first, i));
  return cells;
}
