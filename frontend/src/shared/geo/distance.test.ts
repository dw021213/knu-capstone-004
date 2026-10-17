import { describe, expect, it } from 'vitest';
import { distanceMeters, formatDistance } from './distance';

const AIRPORT: [number, number] = [126.493, 33.5113];
const CITY_HALL: [number, number] = [126.5312, 33.4996];

describe('distanceMeters (하버사인, [lng, lat])', () => {
  it('제주공항과 제주시청은 3,773m에서 1% 안', () => {
    const d = distanceMeters(AIRPORT, CITY_HALL);
    expect(Math.abs(d - 3773) / 3773).toBeLessThan(0.01);
  });

  it('같은 점은 0, 순서를 바꿔도 같다', () => {
    expect(distanceMeters(AIRPORT, AIRPORT)).toBe(0);
    expect(distanceMeters(CITY_HALL, AIRPORT)).toBeCloseTo(distanceMeters(AIRPORT, CITY_HALL), 6);
  });

  it('위도 1도는 약 111.2km', () => {
    expect(distanceMeters([126.5, 33], [126.5, 34]) / 1000).toBeCloseTo(111.2, 1);
  });
});

describe('formatDistance', () => {
  it('1km 미만은 10m 단위, 이상은 소수 한 자리 km', () => {
    expect(formatDistance(4)).toBe('0m');
    expect(formatDistance(346)).toBe('350m');
    expect(formatDistance(994)).toBe('990m');
    expect(formatDistance(996)).toBe('1.0km');
    expect(formatDistance(3773.4)).toBe('3.8km');
    expect(formatDistance(12345)).toBe('12.3km');
  });
});
