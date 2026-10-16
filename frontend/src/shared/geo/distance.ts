/** 지구 평균 반지름(m, IUGG) */
const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** 두 점 [경도, 위도] 사이 지표면 거리(m), 하버사인 */
export function distanceMeters([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 화면 표기: 1km 미만은 10m 단위, 이상은 소수 한 자리 km */
export function formatDistance(m: number): string {
  const tens = Math.round(m / 10) * 10;
  return tens < 1000 ? `${tens}m` : `${(m / 1000).toFixed(1)}km`;
}
