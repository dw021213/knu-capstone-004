import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LiveWeatherLookup } from '../../data/types';
import styles from './LocationWeather.module.css';

const kstTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function LocationWeather({
  lngLat,
  load,
}: {
  lngLat: [number, number];
  load: LiveWeatherLookup;
}) {
  const titleId = useId();
  const { data, isPending, isError } = useQuery({
    queryKey: ['live-weather', ...lngLat],
    queryFn: ({ signal }) => load(lngLat, signal),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const forecast = data?.source === 'forecast';
  return (
    <section className={styles.card} aria-labelledby={titleId} aria-live="polite">
      <div className={styles.header}>
        <h3 id={titleId}>기상청 날씨</h3>
        {data && <span className={styles.badge}>{forecast ? '예보' : '실황'}</span>}
      </div>
      {data ? (
        <>
          <p className={styles.time}>
            기준 시각 <time dateTime={data.base_at}>{kstTime.format(new Date(data.base_at))}</time>{' '}
            (KST)
          </p>
          {forecast && (
            <p className={styles.time}>
              적용 시각{' '}
              <time dateTime={data.valid_at}>{kstTime.format(new Date(data.valid_at))}</time>
            </p>
          )}
          <dl className={styles.values}>
            <div>
              <dt>기온</dt>
              <dd>{data.temperature_c}°C</dd>
            </div>
            <div>
              <dt>습도</dt>
              <dd>{data.humidity_pct}%</dd>
            </div>
            <div>
              <dt>1시간 강수량</dt>
              <dd>
                {data.precipitation_1h_mm == null
                  ? (data.precipitation_1h_text ?? '자료 없음')
                  : `${data.precipitation_1h_mm} mm`}
              </dd>
            </div>
            <div>
              <dt>풍속</dt>
              <dd>{data.wind_speed_mps} m/s</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className={styles.time}>
          {isPending
            ? '날씨를 불러오는 중…'
            : isError
              ? '날씨를 불러오지 못했어요'
              : '이 위치의 날씨 자료가 없어요'}
        </p>
      )}
    </section>
  );
}
