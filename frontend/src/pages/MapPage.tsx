import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dataSource, type DataSource } from '../data';
import { CellSheet, type SheetTarget } from '../features/cell-sheet/CellSheet';
import { useSheetData } from '../features/cell-sheet/useSheetData';
import { chipLabel } from '../features/date/kst';
import { useSelectedDate } from '../features/date/useSelectedDate';
import { DateChips } from '../features/date/DateChips';
import { LayerPanel } from '../features/layers/LayerPanel';
import { buildMarkerLayout } from '../features/layers/markerLayout';
import { PoiCard } from '../features/layers/PoiCard';
import { LAYER_TYPES, useLayers } from '../features/layers/useLayers';
import { usePoiLayers } from '../features/layers/usePoiLayers';
import { Legend } from '../features/legend/Legend';
import { cellAt } from '../features/map/hitTest';
import { MapView, type MapFocus } from '../features/map/MapView';
import { PlaceSearch } from '../features/search/PlaceSearch';
import { cellCenter } from '../shared/geo/h3';
import type { PoiType } from '../data/types';
import { useScores } from './useScores';
import styles from './MapPage.module.css';

export function MapPage({ source = dataSource }: { source?: DataSource }) {
  const { data: scores } = useScores(source);
  // 셀 시트 대상: 격자 셀 또는 격자 밖(바다)을 누른 곳
  const [target, setTarget] = useState<SheetTarget | null>(null);
  const selected = target?.kind === 'cell' ? target.h3 : null;
  // 시트를 닫으면 열기 전 포커스로 돌아간다(검색창 등)
  const returnFocus = useRef<Element | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // 검색으로 고른 곳(지도가 옮겨 가 확대한다)
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const { date } = useSelectedDate();
  const sheetData = useSheetData(source, target !== null);
  // 마커를 눌러 연 시설 카드
  const [picked, setPicked] = useState<{ type: PoiType; id: string } | null>(null);
  const layers = useLayers();
  const states = usePoiLayers(source, layers.on);
  const { toggle, off } = layers;
  // 켜서 받아 보니 아직 자료가 없는 종류는 끈다(패널에는 '준비 중'으로 남는다)
  const pendingOn = LAYER_TYPES.filter((t) => layers.on.has(t) && states[t].status === 'pending');
  useEffect(() => {
    pendingOn.forEach(off);
  });
  // 켜고 받은 레이어만 지도에 그린다. 받아 둔 레이어 객체가 같으면 배치 함수도 같다
  const [l0, l1, l2, l3, l4] = LAYER_TYPES.map((t) => {
    const st = states[t];
    return layers.on.has(t) && st.status === 'ready' ? st.layer : null;
  });
  const markerLayout = useMemo(
    () => buildMarkerLayout([l0, l1, l2, l3, l4].filter((l) => l !== null)),
    [l0, l1, l2, l3, l4],
  );
  // 카드: 그 종류를 끄면 닫힌다
  const pickedState = picked && layers.on.has(picked.type) ? states[picked.type] : null;
  const pickedLayer = pickedState?.status === 'ready' ? pickedState.layer : null;
  const pickedPoi = pickedLayer?.items.find((p) => p.id === picked?.id) ?? null;

  const openSheet = (t: SheetTarget) => {
    if (!target) returnFocus.current = document.activeElement;
    setTarget(t);
  };
  const closeSheet = () => {
    setTarget(null);
    const el = returnFocus.current;
    returnFocus.current = null;
    if (el instanceof HTMLElement && el !== document.body) {
      requestAnimationFrame(() => {
        if (el.isConnected) el.focus();
      });
    }
  };

  // 데스크톱 오른쪽 패널이 범례 카드를 가리지 않게 범례 높이를 CSS 변수로 넘긴다
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const legend = overlay?.querySelector('[data-testid="legend"]');
    if (!overlay || !legend) return;
    const ro = new ResizeObserver(() => {
      overlay.style.setProperty('--legend-h', `${legend.getBoundingClientRect().height}px`);
    });
    ro.observe(legend);
    return () => ro.disconnect();
  }, []);

  const count = LAYER_TYPES.filter(
    (t) => layers.on.has(t) && states[t].status !== 'pending',
  ).length;

  return (
    <main className={styles.page} aria-label="지도">
      <MapView
        scores={scores}
        selected={selected}
        onCellSelect={(h3, lngLat) => {
          setPicked(null);
          openSheet(h3 ? { kind: 'cell', h3 } : { kind: 'sea', lngLat });
        }}
        markers={markerLayout}
        onMarkerSelect={(type, id) => setPicked({ type: type as PoiType, id })}
        highlight={pickedPoi?.id ?? null}
        focus={focus}
      />
      {/* 지도 위에 얹는 층. MapView 밖(형제)에 두어 여기서 누른 것은 확대·셀 선택으로 가지 않는다 */}
      <div ref={overlayRef} className={styles.overlay} data-testid="map-overlay">
        <header className={styles.top}>
          <PlaceSearch
            onPick={(item, input) => {
              setFocus((f) => ({ key: (f?.key ?? 0) + 1, bbox: item.bbox, point: item.center }));
              setPicked(null);
              // 고른 곳의 셀 시트를 연다. 시트를 닫으면 검색창으로 돌아온다
              const [lng, lat] = item.center;
              const h3 = scores ? cellAt(lng, lat, scores.cells) : null;
              returnFocus.current = input;
              setTarget(h3 ? { kind: 'cell', h3 } : { kind: 'sea', lngLat: item.center });
            }}
          />
          {/* 위험 종류 탭 자리. 지금은 '종합' 하나라 선택된 라벨로 둔다 */}
          <div className={styles.tabs} data-testid="risk-tabs" role="group" aria-label="위험 종류">
            <span className={styles.tab} aria-current="true">
              종합
            </span>
          </div>
        </header>
        <LayerPanel on={layers.on} toggle={toggle} count={count} states={states} />
        <Legend mode={source.mode} generatedAt={scores?.generatedAt} />
        {/* 아래 묶음: 셀 시트를 날짜 칩 위에 쌓아 시트를 연 채로도 날짜를 바꿀 수 있다 */}
        <div className={styles.dock}>
          {target && (
            <CellSheet
              target={target}
              cell={target.kind === 'cell' ? scores?.cells.get(target.h3) : undefined}
              mode={source.mode}
              weather={scores?.weather ?? 'off'}
              dateLabel={chipLabel(date)}
              data={sheetData}
              // 시설 카드와 함께 보이지 않는다: 카드가 떠 있는 동안 숨기고 닫으면 다시 보인다
              hidden={pickedPoi !== null}
              onClose={closeSheet}
            />
          )}
          <DateChips mode={source.mode} />
        </div>
        {pickedPoi && pickedLayer && (
          <PoiCard
            poi={pickedPoi}
            layer={pickedLayer}
            from={selected ? cellCenter(selected) : null}
            onClose={() => setPicked(null)}
          />
        )}
      </div>
      {/* 선택한 셀 id(e2e·디버그용). 바다를 누르면 비운다 */}
      <output className="sr-only" data-testid="selected-cell">
        {selected ?? ''}
      </output>
    </main>
  );
}
