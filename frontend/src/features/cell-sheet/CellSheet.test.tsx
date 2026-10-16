import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toCellScore } from '../../data/snapshot';
import type { EmergencyList, PoiLayer, PoiType } from '../../data/types';
import { cellCenter } from '../../shared/geo/h3';
import type { LayerState } from '../layers/usePoiLayers';
import { CellSheet, type SheetTarget } from './CellSheet';
import type { SheetData } from './useSheetData';

afterEach(cleanup);

const H3 = '8830d1cc09fffff'; // 제주시청 셀
const [lng, lat] = cellCenter(H3);

function ready(type: PoiType, items: { id: string; name: string; dlat: number }[]): LayerState {
  const layer: PoiLayer = {
    type,
    status: 'ready',
    source: '테스트',
    items: items.map((i) => ({ id: i.id, type, name: i.name, lng, lat: lat + i.dlat })),
  };
  return { status: 'ready', layer };
}

const ER: EmergencyList = {
  status: 'ready',
  source: '테스트',
  items: [{ id: 'er-1', type: 'er', name: '테스트병원', lng, lat: lat + 0.02 }],
};

function data(over: Partial<SheetData> = {}): SheetData {
  return {
    facilities: {
      cctv: ready('cctv', [{ id: 'c1', name: 'c1', dlat: 0.001 }]),
      convenience: ready('convenience', []),
      lodging: { status: 'loading' },
      police: {
        status: 'pending',
        layer: { type: 'police', status: 'pending', source: '', items: [] },
      },
      fire: ready('fire', [{ id: 'f1', name: '중앙119안전센터', dlat: 0.01 }]),
    },
    emergency: { status: 'done', list: ER },
    emd: null,
    ...over,
  };
}

const cellTarget: SheetTarget = { kind: 'cell', h3: H3 };

function renderSheet(props: Partial<Parameters<typeof CellSheet>[0]> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <CellSheet
      target={cellTarget}
      cell={toCellScore(H3, 82, 'standard_link')}
      mode="snapshot"
      weather="off"
      dateLabel="10월 20일 (화)"
      data={data()}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...utils, onClose };
}

describe('CellSheet', () => {
  it('snapshot 모드 기준 문구', () => {
    renderSheet();
    expect(screen.getByTestId('sheet-basis')).toHaveTextContent(
      '교통사고 도로 모델 · 날짜 무관 · 날씨 미반영',
    );
  });

  it('api 모드: 관측 날씨를 반영했으면 고른 날짜와 함께 적고 근거 문장에도 넣는다', () => {
    renderSheet({ mode: 'api', weather: 'on' });
    expect(screen.getByTestId('sheet-basis')).toHaveTextContent(
      '교통사고 도로 모델 · 10월 20일 (화) · 관측 날씨 반영',
    );
    expect(screen.getByTestId('sheet-reason')).toHaveTextContent(
      '관측 날씨 가산이 들어간 값이에요.',
    );
    expect(screen.getByRole('list', { name: '출처' })).toHaveTextContent('기상청 AWS 관측');
  });

  it('api 모드: 그 시각 관측이 없으면 없다고 적는다', () => {
    renderSheet({ mode: 'api', weather: 'no_data' });
    expect(screen.getByTestId('sheet-basis')).toHaveTextContent(
      '교통사고 도로 모델 · 10월 20일 (화) · 날씨 관측 없음',
    );
  });

  it('snapshot 모드는 백엔드 날씨 상태가 있어도 날씨 문장을 넣지 않는다', () => {
    renderSheet({ mode: 'snapshot', weather: 'on' });
    expect(screen.getByTestId('sheet-reason')).not.toHaveTextContent('날씨');
  });

  it('같은 셀 점수가 바뀌면(api 모드 날짜 변경) 배지와 문장이 바뀐다', () => {
    const { rerender, onClose } = renderSheet({ mode: 'api', weather: 'on' });
    expect(screen.getByTestId('sheet-badge')).toHaveTextContent('4 · 높음');
    rerender(
      <CellSheet
        target={cellTarget}
        cell={toCellScore(H3, 95, 'standard_link')}
        mode="api"
        weather="no_data"
        dateLabel="10월 21일 (수)"
        data={data()}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('sheet-badge')).toHaveTextContent('5 · 매우 높음');
    expect(screen.getByTestId('sheet-basis')).toHaveTextContent('10월 21일 (수) · 날씨 관측 없음');
  });

  it('주변 시설: 받은 종류는 숫자(0 포함), 받는 중은 …, 자료 없음은 준비 중. 근거 문장은 받은 것만 말한다', () => {
    renderSheet();
    const rows = screen.getAllByRole('row').map((r) => r.textContent);
    expect(rows).toEqual([
      '시설300m 안500m 안',
      'CCTV11',
      '편의점00',
      '숙박……',
      '경찰준비 중준비 중',
      '119안전센터00',
    ]);
    const reason = screen.getByTestId('sheet-reason').textContent!;
    expect(reason).toContain('반경 300m 안에 CCTV 1곳이 있고 편의점은 없어요.');
    expect(reason).not.toContain('숙박');
    expect(reason).not.toContain('경찰');
  });

  it('가까운 도움: 119와 응급실 이름·거리, 응급실 자료가 없으면 119만', () => {
    renderSheet();
    expect(screen.getByTestId('help-fire')).toHaveTextContent('119안전센터중앙119안전센터 1.1km');
    expect(screen.getByTestId('help-er')).toHaveTextContent('응급실테스트병원 2.2km');
    cleanup();
    renderSheet({
      data: data({
        emergency: { status: 'done', list: { status: 'pending', source: '', items: [] } },
      }),
    });
    expect(screen.queryByTestId('help-er')).toBeNull();
    expect(screen.getByTestId('help-fire')).toBeInTheDocument();
  });

  it('바다: 위험도 정보가 없다는 제목과 가까운 도움만', () => {
    renderSheet({ target: { kind: 'sea', lngLat: [126.3, 33.7] }, cell: undefined });
    expect(
      screen.getByRole('heading', { name: '이 위치는 위험도 정보가 없어요' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-badge')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('region', { name: '가까운 도움' })).toBeInTheDocument();
  });

  it('바다: 출처는 가까운 도움에 쓴 것(119·응급실·좌표·읍면동)만, 가까운 도움 아래에 둔다', () => {
    renderSheet({ target: { kind: 'sea', lngLat: [126.3, 33.7] }, cell: undefined });
    const list = screen.getByRole('list', { name: '출처' });
    expect(list).toHaveTextContent('119안전센터: 소방청');
    expect(list).toHaveTextContent('응급실');
    expect(list).toHaveTextContent('© OpenStreetMap contributors');
    expect(list).not.toHaveTextContent('CCTV');
    expect(list).not.toHaveTextContent('편의점');
    const help = screen.getByRole('region', { name: '가까운 도움' });
    expect(help.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Esc와 닫기 버튼은 onClose를 부른다', async () => {
    const { onClose } = renderSheet();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
