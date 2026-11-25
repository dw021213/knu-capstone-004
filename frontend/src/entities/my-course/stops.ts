import { distanceMeters } from '../../shared/geo/distance';
import { MAX_STOPS, type Stop } from './store';

/** 장소 번호가 없는 쪽(지도에서 고른 곳, 읍면동)이 있으면 이 거리(m) 안을 같은 장소로 본다 */
export const SAME_PLACE_M = 20;

type Point = Pick<Stop, 'lat' | 'lng' | 'kakaoId'>;

/** 둘 다 카카오 장소면 번호로, 아니면 거리로(같은 건물 안 다른 가게를 같은 곳으로 보지 않게) */
export const samePlace = (a: Point, b: Point) =>
  a.kakaoId !== undefined && b.kakaoId !== undefined
    ? a.kakaoId === b.kakaoId
    : distanceMeters([a.lng, a.lat], [b.lng, b.lat]) <= SAME_PLACE_M;

/** 끝에 더할 수 없는 까닭. full: 다 참, repeat: 바로 앞 장소와 같음 */
export function addBlock(stops: readonly Stop[], p: Point): 'full' | 'repeat' | null {
  if (stops.length >= MAX_STOPS) return 'full';
  const last = stops.at(-1);
  return last && samePlace(last, p) ? 'repeat' : null;
}

/** 끝에 더한다. 다 찼거나 바로 앞 장소와 같으면 그대로 */
export function addStop(stops: readonly Stop[], stop: Stop): Stop[] {
  return addBlock(stops, stop) ? [...stops] : [...stops, stop];
}

/** 장소 줄 이름표(길찾기 출발·경유·도착처럼). 한 곳뿐이면 출발 */
export function stopRole(i: number, count: number): string {
  if (i === 0) return '출발';
  return i === count - 1 ? '도착' : `경유 ${i}`;
}

/** i번째를 한 칸 위(-1)나 아래(+1)로. 끝을 넘으면 그대로 */
export function moveStop(stops: readonly Stop[], i: number, by: -1 | 1): Stop[] {
  const j = i + by;
  const out = [...stops];
  if (i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function removeStop(stops: readonly Stop[], id: string): Stop[] {
  return stops.filter((s) => s.id !== id);
}
