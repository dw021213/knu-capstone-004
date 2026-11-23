import type { LiveWeather, LiveWeatherLookup } from './types';

export function createLiveWeatherLookup(apiBase: string): LiveWeatherLookup {
  const endpoint = `${apiBase.replace(/\/+$/, '')}/api/weather/live`;
  return async ([lng, lat], signal) => {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    const response = await fetch(`${endpoint}?${params}`, { signal });
    if (response.status === 400 || response.status === 404) return null;
    if (!response.ok) throw new Error(`날씨 조회 응답 ${response.status}`);
    const data: LiveWeather = await response.json();
    if (
      (data.source !== 'observation' && data.source !== 'forecast') ||
      !Number.isFinite(Date.parse(data.base_at)) ||
      !Number.isFinite(Date.parse(data.valid_at))
    ) {
      throw new Error('기상청 날씨 응답 형식 오류');
    }
    return data;
  };
}
