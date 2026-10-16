import { distanceMeters } from '../../shared/geo/distance';

/** public/data/emd.json의 읍면동 하나(scripts/build-emd.mjs 생성물) */
export interface EmdItem {
  /** 행정동 코드(10자리) */
  code: string;
  /** 읍면동 이름(예: 애월읍) */
  name: string;
  /** 시 이름(제주시, 서귀포시) */
  sgg: string;
  /** 경계 안 대표점 [경도, 위도]. 검색으로 고르면 이 점으로 옮긴다 */
  center: [number, number];
  /** [서, 남, 동, 북] */
  bbox: [number, number, number, number];
  /** 줄인 외곽선들 [경도, 위도][] */
  polygons: [number, number][][];
}

export interface EmdFile {
  source: string;
  license: string;
  items: EmdItem[];
}

export interface Place {
  item: EmdItem;
  /** false면 어느 경계에도 들지 않아 가장 가까운 곳을 골랐다(바다, 줄인 해안선 밖) */
  inside: boolean;
}

/** 짝홀 규칙(감김 방향과 무관) */
function inRing([x, y]: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function contains(item: EmdItem, p: [number, number]): boolean {
  const [w, s, e, n] = item.bbox;
  if (p[0] < w || p[0] > e || p[1] < s || p[1] > n) return false;
  return item.polygons.some((ring) => inRing(p, ring));
}

/** 점 [경도, 위도]가 든 읍면동. 없으면 꼭짓점이 가장 가까운 읍면동 */
export function placeAt(items: readonly EmdItem[], p: [number, number]): Place | null {
  const hit = items.find((it) => contains(it, p));
  if (hit) return { item: hit, inside: true };
  let best: EmdItem | null = null;
  let bestD = Infinity;
  for (const it of items) {
    for (const ring of it.polygons) {
      for (const v of ring) {
        const d = distanceMeters(p, v);
        if (d < bestD) {
          bestD = d;
          best = it;
        }
      }
    }
  }
  return best ? { item: best, inside: false } : null;
}

/** '제주시 애월읍', 경계 밖이면 '제주시 애월읍 근처' */
export function placeLabel({ item, inside }: Place): string {
  return `${item.sgg} ${item.name}${inside ? '' : ' 근처'}`;
}

const squash = (s: string) => s.replace(/\s+/g, '');

/** 이름(또는 '시 이름 + 읍면동') 일부로 찾는다. 이름 앞이 맞는 것을 먼저, 최대 limit개 */
export function searchEmd(items: readonly EmdItem[], query: string, limit = 8): EmdItem[] {
  const q = squash(query);
  if (!q) return [];
  const scored: [number, EmdItem][] = [];
  for (const it of items) {
    const name = squash(it.name);
    const full = squash(`${it.sgg}${it.name}`);
    if (name.startsWith(q)) scored.push([0, it]);
    else if (name.includes(q)) scored.push([1, it]);
    else if (full.includes(q)) scored.push([2, it]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, 'ko'));
  return scored.slice(0, limit).map(([, it]) => it);
}
