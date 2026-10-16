import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataSource } from '../data';
import { DateChips } from '../features/date/DateChips';
import { Legend } from '../features/legend/Legend';
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
      {/* 지도 위에 얹는 층. MapView 밖(형제)에 두어 여기서 누른 것은 확대·셀 선택으로 가지 않는다 */}
      <div className={styles.overlay}>
        <header className={styles.top}>
          {/* 위험 종류 탭 자리. 지금은 '종합' 하나라 선택된 라벨로 둔다 */}
          <div className={styles.tabs} data-testid="risk-tabs" role="group" aria-label="위험 종류">
            <span className={styles.tab} aria-current="true">
              종합
            </span>
          </div>
        </header>
        <Legend mode={dataSource.mode} />
        <DateChips mode={dataSource.mode} />
      </div>
      {/* 셀 시트(U6) 전까지 선택 결과를 e2e와 보조기기에 알린다 */}
      <output className="sr-only" data-testid="selected-cell">
        {selected ?? ''}
      </output>
    </main>
  );
}
