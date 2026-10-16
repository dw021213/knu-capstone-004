import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  select,
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type Selection,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3';
import type { Scores } from '../../data/types';
import { drawCells, makeHatchPattern, prepareCells } from './cellCanvas';
import { BASEMAP } from './basemap';
import { cellAt } from './hitTest';
import { TAP_DELAY } from './gesture';
import { drawMarkers, hitTest, type MarkerHit, type MarkerLayout } from './markerCanvas';
import { drawRoute, type MapRoute, type RouteHits } from './routeCanvas';
import { tileUrl, visibleTiles } from './tiles';
import { JEJU_BOUNDS } from './projection';
import {
  SCALE_EXTENT,
  constrainView,
  focusView,
  homeView,
  lngLatToScreen,
  screenToLngLat,
  worldExtent,
  zoomLevel,
  type Insets,
  type View,
} from './view';
import styles from './MapView.module.css';

export interface MapViewProps {
  scores?: Scores;
  selected?: string | null;
  onCellSelect?: (h3: string | null, lngLat: [number, number]) => void;
  overlays?: ReactNode;
  /** 시설 마커 배치. 조작이 끝날 때마다 불러 다시 그린다 */
  markers?: MarkerLayout;
  /** 개별 마커를 눌렀을 때(셀 선택은 바뀌지 않는다) */
  onMarkerSelect?: (group: string, id: string) => void;
  /** 크게 그릴 마커 id */
  highlight?: string | null;
  /** 이곳으로 옮기고 확대한다(검색). key가 바뀔 때마다 한 번 */
  focus?: MapFocus | null;
  /** 지도 위 검색·날짜 칩이 가리는 위·아래 높이. 첫 화면은 그 사이 가운데에 본섬을 둔다 */
  insets?: Insets | null;
  /** 지도에 찍을 위치 점. me: 내 위치, fallback: 위치를 못 써서 기준으로 삼은 곳(이름을 붙인다) */
  location?: MapLocation | null;
  /** 코스 경로(구간 등급 색)와 주의 지점 */
  route?: MapRoute | null;
  /** 주면 이 셀들만 그대로 칠하고 나머지 셀은 흐리게(코스 화면) */
  dim?: ReadonlySet<string> | null;
}

export type { MapRoute };

export type MapLocation =
  | { kind: 'me'; lngLat: [number, number] }
  | { kind: 'fallback'; lngLat: [number, number]; label: string };

export interface MapFocus {
  key: number;
  /** 맞출 경계 [서, 남, 동, 북] */
  bbox: [number, number, number, number];
  /** 화면 위쪽 가운데에 둘 점 [경도, 위도] */
  point: [number, number];
  /** 맞출 때 줌 범위(기본 12~14). 코스 전체처럼 넓은 곳은 낮춘다 */
  zoom?: { min: number; max: number };
  /** 점을 둘 세로 위치(화면 높이 비율, 기본 0.4) */
  anchorY?: number;
  /** 오른쪽에서 가리는 너비(px). 가로는 그 왼쪽 영역 가운데에 맞춘다 */
  right?: number;
}

/** 이 거리(CSS px)보다 덜 움직이고 뗀 포인터만 셀 선택으로 본다 */
const CLICK_SLOP = 6;
/** 클러스터를 누르면 이만큼 확대 */
const CLUSTER_ZOOM_BY = 2;

/** 그린 시점 변환(from)의 화면 좌표 → 지금 변환(to)의 화면 좌표 */
function reproject(from: View, to: View, [x, y]: [number, number]): [number, number] {
  const r = to.k / from.k;
  return [(x - from.x) * r + to.x, (y - from.y) * r + to.y];
}

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export function MapView({
  scores,
  selected = null,
  onCellSelect,
  overlays,
  markers,
  onMarkerSelect,
  highlight = null,
  focus = null,
  insets = null,
  location = null,
  route = null,
  dim = null,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerCanvasRef = useRef<HTMLCanvasElement>(null);
  // 마지막으로 그린 마커(그린 변환 기준 화면 좌표)와 그 변환
  const hitsRef = useRef<{ view: View; hits: MarkerHit[] }>({
    view: { k: 1, x: 0, y: 0 },
    hits: [],
  });
  // 마지막으로 그린 코스 주의 지점(그린 변환 기준 화면 좌표)
  const routeRef = useRef<{ view: View; lines: number } & RouteHits>({
    view: { k: 1, x: 0, y: 0 },
    lines: 0,
    marks: [],
    ends: [],
  });
  const zoomRef = useRef<{
    behavior: ZoomBehavior<HTMLDivElement, unknown>;
    sel: Selection<HTMLDivElement, unknown, null, undefined>;
  } | null>(null);
  const hatchRef = useRef<{ ctx: CanvasRenderingContext2D; pattern: CanvasPattern | null } | null>(
    null,
  );
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // view: 지금 화면 변환, settled: 마지막으로 셀을 그린 변환(조작이 끝날 때 갱신)
  const [view, setView] = useState<View | null>(null);
  const [settled, setSettled] = useState<View | null>(null);
  // 이벤트 처리기가 읽는 지금 변환(렌더 중에는 읽지 않는다)
  const viewRef = useRef<View | null>(null);

  const cells = useMemo(() => (scores ? prepareCells(scores.cells.values()) : []), [scores]);

  // 컨테이너 크기
  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 첫 화면 맞춤에만 쓴다(나중에 바뀌어도 화면을 옮기지 않는다)
  const insetsRef = useRef(insets);
  useLayoutEffect(() => {
    insetsRef.current = insets;
  });

  // 확대·이동: d3-zoom(휠, 핀치, 드래그, 두 번 누르기). 처음에는 제주 본섬에 맞춘다
  useEffect(() => {
    if (!size) return;
    const el = containerRef.current!;
    const extent: [[number, number], [number, number]] = [
      [0, 0],
      [size.w, size.h],
    ];
    const toView = ({ k, x, y }: ZoomTransform): View => ({ k, x, y });
    const behavior = zoom<HTMLDivElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .translateExtent(worldExtent(JEJU_BOUNDS))
      .constrain(constrainView)
      .extent(extent)
      .on('zoom', (e: D3ZoomEvent<HTMLDivElement, unknown>) => {
        const v = toView(e.transform);
        viewRef.current = v;
        setView(v);
      })
      .on('end', (e: D3ZoomEvent<HTMLDivElement, unknown>) => setSettled(toView(e.transform)));
    const sel = select(el).call(behavior);
    zoomRef.current = { behavior, sel };
    const start = viewRef.current ?? homeView(size.w, size.h, insetsRef.current ?? undefined);
    const t = zoomIdentity.translate(start.x, start.y).scale(start.k);
    // zoom.transform은 경계를 적용하지 않으므로 먼저 constrain을 거친다
    sel.call(behavior.transform, behavior.constrain()(t, extent, worldExtent(JEJU_BOUNDS)));
    return () => {
      sel.on('.zoom', null);
      zoomRef.current = null;
    };
  }, [size]);

  // 검색으로 고른 곳으로 옮기고 확대한다
  const focusKey = focus?.key;
  const focusRef = useRef(focus);
  const appliedFocus = useRef<number | null>(null);
  // 옮기기를 끝낸 맞춤 key(e2e가 첫 맞춤이 끝났는지 본다)
  const doneFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    focusRef.current = focus;
  });
  useEffect(() => {
    const f = focusRef.current;
    if (focusKey === undefined || !f || !zoomRef.current || !size) return;
    // 같은 검색 결과로는 한 번만 옮긴다(크기가 바뀌어도 다시 옮기지 않음)
    if (appliedFocus.current === focusKey) return;
    appliedFocus.current = focusKey;
    const { behavior, sel } = zoomRef.current;
    const [west, south, east, north] = f.bbox;
    const v = focusView(size.w, size.h, { west, south, east, north }, f.point, {
      minZ: f.zoom?.min,
      maxZ: f.zoom?.max,
      anchorY: f.anchorY,
      right: f.right,
    });
    const extent: [[number, number], [number, number]] = [
      [0, 0],
      [size.w, size.h],
    ];
    const t = behavior.constrain()(
      zoomIdentity.translate(v.x, v.y).scale(v.k),
      extent,
      worldExtent(JEJU_BOUNDS),
    );
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    sel
      .transition()
      .duration(reduce ? 0 : 300)
      .call(behavior.transform, t)
      .on('end', () => {
        doneFocus.current = focusKey;
      });
  }, [focusKey, size]);

  // 셀 그리기(조작이 끝났을 때, 크기·데이터·선택이 바뀔 때)
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || !settled) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(size.w * dpr);
    const bh = Math.round(size.h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (hatchRef.current?.ctx !== ctx) hatchRef.current = { ctx, pattern: makeHatchPattern(ctx) };
    // 선택한 셀 위 등급 숫자(데이터 부족 셀은 숫자 없이 테두리만)
    const level = selected ? scores?.cells.get(selected)?.level : null;
    drawCells(ctx, cells, settled, {
      width: size.w,
      height: size.h,
      dpr,
      hatch: hatchRef.current.pattern,
      selected,
      tag: level
        ? {
            text: String(level),
            ink: cssVar(canvas, '--ink'),
            white: cssVar(canvas, '--white'),
            font: cssVar(canvas, '--font'),
          }
        : null,
      dim,
    });
    const drawn = route
      ? drawRoute(ctx, route, settled, {
          white: cssVar(canvas, '--white'),
          ink: cssVar(canvas, '--ink'),
          font: cssVar(canvas, '--font'),
        })
      : { marks: [], ends: [] };
    routeRef.current = { view: settled, lines: route?.lines.length ?? 0, ...drawn };
    if (cells.length > 0) {
      performance.mark('cells-drawn');
      window.__mapReady = true;
    }
  }, [cells, settled, size, selected, scores, route, dim]);

  // 시설 마커(조작이 끝났을 때, 크기·마커·강조가 바뀔 때). 셀 canvas와 같은 방식
  useLayoutEffect(() => {
    const canvas = markerCanvasRef.current;
    if (!canvas || !size || !settled) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(size.w * dpr);
    const bh = Math.round(size.h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const items = markers
      ? markers({
          width: size.w,
          height: size.h,
          zoom: zoomLevel(settled),
          view: settled,
          project: (lng, lat) => lngLatToScreen(settled, lng, lat),
        })
      : [];
    const hits = drawMarkers(ctx, items, {
      width: size.w,
      height: size.h,
      dpr,
      ink: cssVar(canvas, '--ink'),
      white: cssVar(canvas, '--white'),
      font: cssVar(canvas, '--font'),
      highlight,
    });
    hitsRef.current = { view: settled, hits };
    // 조작 중에는 다시 그리지 않는다(끝날 때 한 번). e2e가 횟수를 센다
    if (items.length > 0) performance.mark('markers-drawn');
  }, [markers, settled, size, highlight]);

  // e2e·디버그용 읽기 전용 창구. 좌표는 페이지(뷰포트) 기준
  useEffect(() => {
    window.__mapDebug = {
      project(lng, lat) {
        const v = viewRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!v || !rect) return [NaN, NaN];
        const [x, y] = lngLatToScreen(v, lng, lat);
        return [rect.left + x, rect.top + y];
      },
      zoom() {
        return viewRef.current ? zoomLevel(viewRef.current) : NaN;
      },
      focusDone() {
        return doneFocus.current;
      },
      route() {
        const v = viewRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        const { view: drawnAt, lines, marks, ends } = routeRef.current;
        if (!v || !rect) return { lines, marks: [], ends: [] };
        const page = (m: { x: number; y: number; label: string }) => {
          const [x, y] = reproject(drawnAt, v, [m.x, m.y]);
          return { x: rect.left + x, y: rect.top + y, label: m.label };
        };
        return { lines, marks: marks.map(page), ends: ends.map(page) };
      },
      markers() {
        const v = viewRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!v || !rect) return [];
        const { view: drawnAt, hits } = hitsRef.current;
        const page = (p: [number, number]): [number, number] => {
          const [x, y] = reproject(drawnAt, v, p);
          return [rect.left + x, rect.top + y];
        };
        return hits.map((h) => {
          const [x, y] = page([h.x, h.y]);
          const [x0, y0] = page([h.box[0], h.box[1]]);
          const [x1, y1] = page([h.box[2], h.box[3]]);
          return {
            kind: h.kind,
            group: h.group,
            x,
            y,
            id: h.id,
            count: h.count,
            label: h.label,
            box: [x0, y0, x1, y1] as [number, number, number, number],
          };
        });
      },
    };
    return () => {
      delete window.__mapDebug;
      window.__mapReady = false;
    };
  }, []);

  // 포인터를 거의 움직이지 않고 뗐을 때만 셀 선택
  const known = scores?.cells;
  const selectRef = useRef(onCellSelect);
  const markerSelectRef = useRef(onMarkerSelect);
  useLayoutEffect(() => {
    selectRef.current = onCellSelect;
    markerSelectRef.current = onMarkerSelect;
  });
  useEffect(() => {
    const el = containerRef.current!;
    const downs = new Map<number, [number, number]>();
    let multi = false;
    // 기다리는 한 번 누르기, 두 번째 누르기로 취소된 포인터
    let pendingTap: number | null = null;
    const secondTap = new Set<number>();
    const onDown = (e: PointerEvent) => {
      downs.set(e.pointerId, [e.clientX, e.clientY]);
      if (downs.size > 1) multi = true;
      if (pendingTap !== null) {
        window.clearTimeout(pendingTap);
        pendingTap = null;
        secondTap.add(e.pointerId);
      }
    };
    const onUp = (e: PointerEvent) => {
      const start = downs.get(e.pointerId);
      downs.delete(e.pointerId);
      const wasSecond = secondTap.delete(e.pointerId);
      const wasMulti = multi;
      if (downs.size === 0) multi = false;
      const v = viewRef.current;
      if (!start || wasMulti || !v) return;
      if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) >= CLICK_SLOP) return;
      const rect = el.getBoundingClientRect();
      const p: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
      // 마커·클러스터를 누른 것이면 셀을 고르지 않는다
      const { view: drawnAt, hits } = hitsRef.current;
      const hit = hits.length > 0 ? hitTest(hits, ...reproject(v, drawnAt, p)) : null;
      if (hit) {
        if (hit.kind === 'marker' && hit.id != null) markerSelectRef.current?.(hit.group, hit.id);
        else if (hit.kind === 'cluster' && zoomRef.current) {
          const { behavior, sel } = zoomRef.current;
          const at = reproject(drawnAt, v, [hit.x, hit.y]);
          const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          sel
            .transition()
            .duration(reduce ? 0 : 250)
            .call(behavior.scaleBy, CLUSTER_ZOOM_BY, at);
        }
        return;
      }
      if (wasSecond) return;
      const lngLat = screenToLngLat(v, p);
      pendingTap = window.setTimeout(() => {
        pendingTap = null;
        selectRef.current?.(known ? cellAt(lngLat[0], lngLat[1], known) : null, lngLat);
      }, TAP_DELAY);
    };
    const onCancel = (e: PointerEvent) => {
      downs.delete(e.pointerId);
      secondTap.delete(e.pointerId);
      if (downs.size === 0) multi = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      if (pendingTap !== null) window.clearTimeout(pendingTap);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [known]);

  const tiles = view && size ? visibleTiles(view, size.w, size.h) : [];
  let canvasTransform: string | undefined;
  if (view && settled && view !== settled) {
    const r = view.k / settled.k;
    canvasTransform = `translate(${view.x - settled.x * r}px, ${view.y - settled.y * r}px) scale(${r})`;
  }

  return (
    <div className={styles.map} data-testid="map">
      {/* 확대·이동과 셀 선택은 이 안에서만. 출처 링크는 밖에 두어 누를 수 있게 한다 */}
      <div ref={containerRef} className={styles.viewport}>
        {tiles.map((t) => (
          <img
            key={`${t.z}/${t.x}/${t.y}`}
            className={styles.tile}
            src={tileUrl(t)}
            alt=""
            draggable={false}
            style={{ left: t.left, top: t.top, width: t.size, height: t.size }}
          />
        ))}
        <canvas
          ref={canvasRef}
          className={styles.cells}
          style={canvasTransform ? { transform: canvasTransform } : undefined}
        />
        <canvas
          ref={markerCanvasRef}
          className={styles.cells}
          data-testid="marker-canvas"
          style={canvasTransform ? { transform: canvasTransform } : undefined}
        />
        {location && view && <LocationMark location={location} view={view} />}
        {overlays}
      </div>
      <p className={styles.attribution}>
        <a href={BASEMAP.attributionUrl} target="_blank" rel="noreferrer">
          {BASEMAP.attribution}
        </a>
      </p>
    </div>
  );
}

/** 위치 점(누르기를 가로채지 않는다). 지금 변환으로 놓아 끄는 동안에도 따라간다 */
function LocationMark({ location, view }: { location: MapLocation; view: View }) {
  const [x, y] = lngLatToScreen(view, ...location.lngLat);
  if (location.kind === 'me') {
    return (
      <div
        className={styles.me}
        style={{ left: x, top: y }}
        data-testid="my-location"
        aria-hidden="true"
      />
    );
  }
  return (
    <div className={styles.fallback} style={{ left: x, top: y }} data-testid="fallback-location">
      <span className={styles.diamond} aria-hidden="true" />
      <span className={styles.placeLabel}>{location.label}</span>
    </div>
  );
}
