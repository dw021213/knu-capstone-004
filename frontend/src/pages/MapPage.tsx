import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataSource } from '../data';
import { MapView } from '../features/map/MapView';
import styles from './MapPage.module.css';

export function MapPage() {
  const { data: scores } = useQuery({
    queryKey: ['scores'],
    queryFn: () => dataSource.getScores(),
  });
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <main className={styles.page} aria-label="지도">
      <MapView scores={scores} selected={selected} onCellSelect={(h3) => setSelected(h3)} />
      {/* 셀 시트(U6) 전까지 선택 결과를 e2e와 보조기기에 알린다 */}
      <output className="sr-only" data-testid="selected-cell">
        {selected ?? ''}
      </output>
    </main>
  );
}
