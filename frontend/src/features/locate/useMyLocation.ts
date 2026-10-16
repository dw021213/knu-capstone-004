import { useLayoutEffect, useRef, useState } from 'react';
import { JEJU_BOUNDS } from '../map/projection';

/** 위치를 쓸 수 없을 때 기준으로 보여 줄 곳(제주시청) [경도, 위도] */
export const CITY_HALL: [number, number] = [126.5312, 33.4996];

export type LocateState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'me'; lngLat: [number, number] }
  | { status: 'outside' }
  | { status: 'denied' }
  | { status: 'unavailable' };

export function insideJeju([lng, lat]: [number, number]): boolean {
  const b = JEJU_BOUNDS;
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}

const PERMISSION_DENIED = 1;

/**
 * '내 위치' 버튼이 눌렸을 때만 위치를 묻는다(처음 열 때 묻지 않는다).
 * 제주 안이면 그곳으로, 거부·실패면 제주시청으로 옮기고(onMove), 제주 밖이면 옮기지 않는다.
 */
export function useMyLocation(onMove: (lngLat: [number, number]) => void) {
  const [state, setState] = useState<LocateState>({ status: 'idle' });
  // 안내 배너를 닫아도 위치 점·기준 점은 남긴다
  const [noticeOpen, setNoticeOpen] = useState(false);
  const moveRef = useRef(onMove);
  useLayoutEffect(() => {
    moveRef.current = onMove;
  });

  const locate = () => {
    const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    const fallback = (status: 'denied' | 'unavailable') => {
      setState({ status });
      setNoticeOpen(true);
      moveRef.current(CITY_HALL);
    };
    if (!geo) {
      fallback('unavailable');
      return;
    }
    setState({ status: 'locating' });
    geo.getCurrentPosition(
      (pos) => {
        const p: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setNoticeOpen(true);
        if (insideJeju(p)) {
          setState({ status: 'me', lngLat: p });
          moveRef.current(p);
        } else {
          setState({ status: 'outside' });
        }
      },
      (err) => fallback(err.code === PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return { state, noticeOpen, locate, dismiss: () => setNoticeOpen(false) };
}
