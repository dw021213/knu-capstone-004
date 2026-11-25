import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cautionGroups } from '../../entities/course/caution';
import type { Segment } from '../../entities/course/segments';
import { CautionList } from './CautionList';

afterEach(cleanup);

/** 4단계 구간 6곳(길이 0.1·0.6·0.3·0.5·0.2·0.4km)을 1km 1단계 구간으로 띄워 놓는다 */
function groups() {
  const lens = [0.1, 0.6, 0.3, 0.5, 0.2, 0.4];
  const segs: Segment[] = [];
  let km = 0;
  for (const len of lens) {
    for (const [level, l] of [
      [4, len],
      [1, 1],
    ] as const) {
      segs.push({
        index: segs.length,
        h3: `h${segs.length}`,
        level,
        startKm: km,
        endKm: km + l,
        coords: [],
      });
      km += l;
    }
  }
  return cautionGroups(segs);
}

const renderList = (onSelect = vi.fn()) =>
  render(
    <CautionList
      groups={groups()}
      placeOf={(g) => `동${g.id}`}
      selected={null}
      onSelect={onSelect}
    />,
  );

const names = () =>
  within(screen.getByRole('list', { name: '주의할 구간 목록' }))
    .getAllByRole('button')
    .map((b) => b.textContent);

describe('CautionList', () => {
  it('길이가 긴 순으로 5곳만 먼저 보이고, 펼치면 6곳이 되며 앞 5곳은 자리를 지킨다', async () => {
    renderList();
    const first = names();
    expect(first).toHaveLength(5);
    // 0.6, 0.5, 0.4, 0.3, 0.2km 순(0.1km는 펼쳐야 보인다)
    const km = first.map((t) => t!.match(/ (\d+\.\d) ~ (\d+\.\d)km$/)!);
    expect(km.map((m) => Number(m[2]) - Number(m[1]))).toEqual(
      [0.6, 0.5, 0.4, 0.3, 0.2].map((v) => expect.closeTo(v, 1)),
    );
    await userEvent.click(screen.getByRole('button', { name: '주의할 구간 모두 보기(6곳)' }));
    expect(names()).toHaveLength(6);
    expect(names().slice(0, 5)).toEqual(first);
    await userEvent.click(screen.getByRole('button', { name: '주의할 구간 접기' }));
    expect(names()).toHaveLength(5);
  });

  it('줄 이름은 읍면동과 거리 범위를 띄어 읽고, 근거 문장·등급은 없다. 누르면 그 묶음 id', async () => {
    const onSelect = vi.fn();
    renderList(onSelect);
    const btn = screen.getByRole('button', { name: '동2 1.1 ~ 1.7km' });
    expect(btn).not.toHaveTextContent(/상위|단계/);
    await userEvent.click(btn);
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
