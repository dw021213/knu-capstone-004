export {};
declare global {
  interface Window {
    __mapReady?: boolean;
    __mapDebug?: {
      project(lng: number, lat: number): [number, number];
      zoom(): number;
      /** 옮기기를 끝낸 마지막 맞춤(focus) key. 아직 없으면 null */
      focusDone(): number | null;
      /** 고른 곳을 보이는 영역으로 옮기기를 끝낸 마지막 reveal key. 아직 없으면 null */
      revealDone(): number | null;
      /** 맞춤(focus)·reveal로 옮기는 중이 아니면 true */
      idle(): boolean;
      /** 지금 그린 코스 구간 수, 주의 지점, 시작·끝 표지(페이지 좌표) */
      route(): {
        lines: number;
        marks: { x: number; y: number; label: string }[];
        /** 시작·끝 표지 */
        ends: { x: number; y: number; label: string }[];
      };
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
        /** 실제 위치(묶음 무게중심). 알약을 비켜 놓았으면 x, y와 다르다 */
        anchor: [number, number];
      }[];
    };
  }
}
