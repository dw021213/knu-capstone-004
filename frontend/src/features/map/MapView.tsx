import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Scores } from '../../data/types';
import { drawCells, makeHatchPattern, prepareCells } from './cellCanvas';
import { cellAt } from './hitTest';
import { tileUrl, visibleTiles } from './tiles';
import { fitView, lngLatToScreen, screenToLngLat, zoomLevel, type View } from './view';
import styles from './MapView.module.css';

export interface MapViewProps {
  scores?: Scores;
  selected?: string | null;
  onCellSelect?: (h3: string | null, lngLat: [number, number]) => void;
  overlays?: ReactNode;
}

/** 이 거리(CSS px)보다 덜 움직이고 뗀 포인터만 셀 선택으로 본다 */
const CLICK_SLOP = 6;

export function MapView({ scores, selected = null, onCellSelect, overlays }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // 처음 화면: 제주 본섬에 맞춘다
  useEffect(() => {
    if (!size || viewRef.current) return;
    const v = fitView(size.w, size.h);
    viewRef.current = v;
    setView(v);
    setSettled(v);
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
    };
    return () => {
      delete window.__mapDebug;
      window.__mapReady = false;
    };
  }, []);

  // 포인터를 거의 움직이지 않고 뗐을 때만 셀 선택
  const known = scores?.cells;
  const selectRef = useRef(onCellSelect);
  useLayoutEffect(() => {
    selectRef.current = onCellSelect;
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
      const lngLat = screenToLngLat(v, [e.clientX - rect.left, e.clientY - rect.top]);
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
    <div ref={containerRef} className={styles.map} data-testid="map">
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
      {overlays}
    </div>
  );
}
