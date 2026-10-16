import { useEffect, useMemo, useState } from 'react';
import { dataSource, type DataSource } from '../data';
import { DateChips } from '../features/date/DateChips';
import { LayerPanel } from '../features/layers/LayerPanel';
import { buildMarkerLayout } from '../features/layers/markerLayout';
import { LAYER_TYPES, useLayers } from '../features/layers/useLayers';
import { usePoiLayers } from '../features/layers/usePoiLayers';
import { Legend } from '../features/legend/Legend';
import { MapView } from '../features/map/MapView';
import { useScores } from './useScores';
import styles from './MapPage.module.css';

export function MapPage({ source = dataSource }: { source?: DataSource }) {
  const { data: scores } = useScores(source);
  const [selected, setSelected] = useState<string | null>(null);
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
  const count = LAYER_TYPES.filter(
    (t) => layers.on.has(t) && states[t].status !== 'pending',
  ).length;

  return (
    <main className={styles.page} aria-label="지도">
      <MapView
        scores={scores}
        selected={selected}
        onCellSelect={(h3) => setSelected(h3)}
        markers={markerLayout}
      />
      {/* 지도 위에 얹는 층. MapView 밖(형제)에 두어 여기서 누른 것은 확대·셀 선택으로 가지 않는다 */}
      <div className={styles.overlay} data-testid="map-overlay">
        <header className={styles.top}>
          {/* 위험 종류 탭 자리. 지금은 '종합' 하나라 선택된 라벨로 둔다 */}
          <div className={styles.tabs} data-testid="risk-tabs" role="group" aria-label="위험 종류">
            <span className={styles.tab} aria-current="true">
              종합
            </span>
          </div>
        </header>
        <LayerPanel on={layers.on} toggle={toggle} count={count} states={states} />
        <Legend mode={source.mode} generatedAt={scores?.generatedAt} />
        <DateChips mode={source.mode} />
      </div>
      {/* 셀 시트(U6) 전까지 선택 결과를 e2e와 보조기기에 알린다 */}
      <output className="sr-only" data-testid="selected-cell">
        {selected ?? ''}
      </output>
    </main>
  );
}
