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
import { drawMarkers, hitTest, type MarkerHit, type MarkerLayout } from './markerCanvas';
import { tileUrl, visibleTiles } from './tiles';
import { JEJU_BOUNDS } from './projection';
import {
  SCALE_EXTENT,
  fitView,
  lngLatToScreen,
  screenToLngLat,
  worldExtent,
  zoomLevel,
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
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerCanvasRef = useRef<HTMLCanvasElement>(null);
  // 마지막으로 그린 마커(그린 변환 기준 화면 좌표)와 그 변환
  const hitsRef = useRef<{ view: View; hits: MarkerHit[] }>({
    view: { k: 1, x: 0, y: 0 },
    hits: [],
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
      .extent(extent)
      .on('zoom', (e: D3ZoomEvent<HTMLDivElement, unknown>) => {
        const v = toView(e.transform);
        viewRef.current = v;
        setView(v);
      })
      .on('end', (e: D3ZoomEvent<HTMLDivElement, unknown>) => setSettled(toView(e.transform)));
    const sel = select(el).call(behavior);
    zoomRef.current = { behavior, sel };
    const start = viewRef.current ?? fitView(size.w, size.h);
    const t = zoomIdentity.translate(start.x, start.y).scale(start.k);
    // zoom.transform은 경계를 적용하지 않으므로 먼저 constrain을 거친다
    sel.call(behavior.transform, behavior.constrain()(t, extent, worldExtent(JEJU_BOUNDS)));
    return () => {
      sel.on('.zoom', null);
      zoomRef.current = null;
    };
  }, [size]);

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
    drawCells(ctx, cells, settled, {
      width: size.w,
      height: size.h,
      dpr,
      hatch: hatchRef.current.pattern,
      selected,
    });
    if (cells.length > 0) {
      performance.mark('cells-drawn');
      window.__mapReady = true;
    }
  }, [cells, settled, size, selected]);

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
    const onDown = (e: PointerEvent) => {
      downs.set(e.pointerId, [e.clientX, e.clientY]);
      if (downs.size > 1) multi = true;
    };
    const onUp = (e: PointerEvent) => {
      const start = downs.get(e.pointerId);
      downs.delete(e.pointerId);
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
      const lngLat = screenToLngLat(v, p);
      selectRef.current?.(known ? cellAt(lngLat[0], lngLat[1], known) : null, lngLat);
    };
    const onCancel = (e: PointerEvent) => {
      downs.delete(e.pointerId);
      if (downs.size === 0) multi = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
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
