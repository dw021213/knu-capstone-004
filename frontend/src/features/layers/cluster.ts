export interface ClusterInput {
  lng: number;
  lat: number;
  id: string;
}

export interface Cluster {
  x: number;
  y: number;
  count: number;
  ids: string[];
}

/**
 * 화면 격자 기반 묶음. 같은 cellPx 칸에 떨어진 점을 하나로 묶고 위치는 점들의 평균.
 * project가 지도 이동에 따라 바뀌지 않는 좌표(월드 픽셀)를 주면 끌어도 묶음이 그대로다.
 */
export function clusterPoints(
  points: ClusterInput[],
  project: (lng: number, lat: number) => [number, number],
  cellPx = 48,
): Cluster[] {
  const cells = new Map<string, { sx: number; sy: number; ids: string[] }>();
  for (const p of points) {
    const [x, y] = project(p.lng, p.lat);
    const key = `${Math.floor(x / cellPx)},${Math.floor(y / cellPx)}`;
    const c = cells.get(key);
    if (c) {
      c.sx += x;
      c.sy += y;
      c.ids.push(p.id);
    } else cells.set(key, { sx: x, sy: y, ids: [p.id] });
  }
  return [...cells.values()].map(({ sx, sy, ids }) => ({
    x: sx / ids.length,
    y: sy / ids.length,
    count: ids.length,
    ids,
  }));
}

/** 화면(width × height) 둘레 margin px 안에 있는가. 밖은 그리지 않는다 */
export function inView(x: number, y: number, width: number, height: number, margin = 0) {
  return x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;
}
