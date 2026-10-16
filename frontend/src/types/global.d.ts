export {};
declare global {
  interface Window {
    __mapReady?: boolean;
    __mapDebug?: {
      project(lng: number, lat: number): [number, number];
      zoom(): number;
      /** 지금 그린 코스 구간 수와 주의 지점(페이지 좌표) */
      route(): { lines: number; marks: { x: number; y: number; label: string }[] };
      /** 지금 그린 시설 마커·클러스터(페이지 좌표) */
      markers(): {
        kind: 'cluster' | 'marker';
        group: string;
        x: number;
        y: number;
        id?: string;
        count?: number;
        label?: string;
        box: [number, number, number, number];
      }[];
    };
  }
}
