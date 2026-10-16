import { describe, expect, it } from 'vitest';
import type { RoadSource } from '../../data/types';
import { levelFromPercentile } from './level';
import { buildReason, type ReasonInput } from './reason';

const MODEL = '교통사고 도로 모델(2017~2021 사고 자료)';
const LINK = '표준노드링크 2026-09-14';
const NGII = '수치지도 2025';
const NEARBY: ReasonInput['nearby'] = { convenience: { r300: 2 }, cctv: { r300: 0 } };
const FACILITY = '반경 300m 안에 편의점 2곳이 있고 CCTV는 자료에 없어요.';

function input(percentile: number | null, roadSource: RoadSource): ReasonInput {
  return { level: levelFromPercentile(percentile), percentile, roadSource, nearby: NEARBY };
}

// 스냅숏: 등급 5개 × 도로 출처 2종 + 데이터 부족 = 11개. 기대 문장은 손으로 적었다
const LINK_CASES: [number, string, string][] = [
  [
    95.02,
    '5 · 매우 높음',
    '도로가 있는 제주 격자 중 상위 5% 안에 드는 곳이에요. 도로 구조(차로 수, 제한속도, 교차로)로 본 교통사고 위험이 매우 높게 나왔어요.',
  ],
  [
    82,
    '4 · 높음',
    '도로가 있는 제주 격자 중 상위 18% 안에 드는 곳이에요. 도로 구조(차로 수, 제한속도, 교차로)로 본 교통사고 위험이 높게 나왔어요.',
  ],
  [
    50.4,
    '3 · 보통',
    '도로가 있는 제주 격자 중 상위 50% 안에 드는 곳이에요. 도로 구조(차로 수, 제한속도, 교차로)로 본 교통사고 위험이 보통으로 나왔어요.',
  ],
  [
    20,
    '2 · 낮음',
    '도로가 있는 제주 격자 중 위험도가 낮은 쪽 20% 안에 드는 곳이에요. 도로 구조(차로 수, 제한속도, 교차로)로 본 교통사고 위험이 낮게 나왔어요.',
  ],
  [
    3.6,
    '1 · 매우 낮음',
    '도로가 있는 제주 격자 중 위험도가 낮은 쪽 4% 안에 드는 곳이에요. 도로 구조(차로 수, 제한속도, 교차로)로 본 교통사고 위험이 매우 낮게 나왔어요.',
  ],
];

const NGII_CASES: [number, string, string][] = [
  [
    99.7,
    '5 · 매우 높음',
    '도로가 있는 제주 격자 중 상위 1% 안에 드는 곳이에요. 도로 길이와 밀도로 본 교통사고 위험이 매우 높게 나왔어요. 섬 지역 수치지도 도로로 계산했어요.',
  ],
  [
    70,
    '4 · 높음',
    '도로가 있는 제주 격자 중 상위 30% 안에 드는 곳이에요. 도로 길이와 밀도로 본 교통사고 위험이 높게 나왔어요. 섬 지역 수치지도 도로로 계산했어요.',
  ],
  [
    30,
    '3 · 보통',
    '도로가 있는 제주 격자 중 위험도가 낮은 쪽 30% 안에 드는 곳이에요. 도로 길이와 밀도로 본 교통사고 위험이 보통으로 나왔어요. 섬 지역 수치지도 도로로 계산했어요.',
  ],
  [
    10,
    '2 · 낮음',
    '도로가 있는 제주 격자 중 위험도가 낮은 쪽 10% 안에 드는 곳이에요. 도로 길이와 밀도로 본 교통사고 위험이 낮게 나왔어요. 섬 지역 수치지도 도로로 계산했어요.',
  ],
  [
    7.29,
    '1 · 매우 낮음',
    '도로가 있는 제주 격자 중 위험도가 낮은 쪽 7% 안에 드는 곳이에요. 도로 길이와 밀도로 본 교통사고 위험이 매우 낮게 나왔어요. 섬 지역 수치지도 도로로 계산했어요.',
  ],
];

describe('buildReason 스냅숏(등급 5 × 도로 2 + 데이터 부족)', () => {
  it.each(LINK_CASES)('표준노드링크 백분위 %s → %s', (p, headline, body) => {
    expect(buildReason(input(p, 'standard_link'))).toEqual({
      headline,
      body: `${body} ${FACILITY}`,
      sources: [MODEL, LINK],
    });
  });

  it.each(NGII_CASES)('수치지도(섬) 백분위 %s → %s', (p, headline, body) => {
    expect(buildReason(input(p, 'ngii_map'))).toEqual({
      headline,
      body: `${body} ${FACILITY}`,
      sources: [MODEL, NGII],
    });
  });

  it('데이터 부족', () => {
    expect(buildReason(input(null, 'none'))).toEqual({
      headline: '데이터 부족',
      body: '이 셀은 도로 자료가 확인되지 않아 위험도를 계산하지 않았어요. 위험하지 않다는 뜻은 아니에요.',
      sources: [MODEL],
    });
  });
});

describe('buildReason 세부 규칙', () => {
  const base = input(82, 'standard_link');

  it('백분위 50 이상은 상위 비율(100 - 백분위 반올림, 최소 1), 50 미만은 낮은 쪽 비율(백분위 반올림, 최소 1)', () => {
    const low = (p: number) => buildReason({ ...base, percentile: p, level: 1 }).body;
    expect(low(0.2)).toContain('도로가 있는 제주 격자 중 위험도가 낮은 쪽 1% 안에 드는 곳이에요.');
    expect(low(49.6)).toContain('위험도가 낮은 쪽 50% 안');
    expect(low(49.6)).not.toContain('상위');
    expect(buildReason({ ...base, percentile: 50, level: 3 }).body).toContain(
      '도로가 있는 제주 격자 중 상위 50% 안에 드는 곳이에요.',
    );
  });

  it('상위 비율은 100 - 백분위를 반올림하고 최소 1', () => {
    expect(buildReason({ ...base, percentile: 99.9, level: 5 }).body).toContain('상위 1% 안');
    expect(buildReason({ ...base, percentile: 100, level: 5 }).body).toContain('상위 1% 안');
    expect(buildReason({ ...base, percentile: 81.5 }).body).toContain('상위 19% 안');
  });

  it('주변 시설: 있는 것만 개수, CCTV·편의점이 0이면 자료에 없다고 말한다(자료가 실제보다 적을 수 있어 단정하지 않음)', () => {
    const body = (nearby: ReasonInput['nearby']) => buildReason({ ...base, nearby }).body;
    expect(
      body({ cctv: { r300: 3 }, convenience: { r300: 1 }, police: { r300: 1 }, fire: { r300: 0 } }),
    ).toContain('반경 300m 안에 CCTV 3곳, 편의점 1곳, 경찰 지구대·파출소 1곳이 있어요.');
    expect(body({ cctv: { r300: 0 }, convenience: { r300: 0 }, lodging: { r300: 0 } })).toContain(
      '반경 300m 안에 CCTV와 편의점은 자료에 없어요.',
    );
    expect(body({ convenience: { r300: 0 }, lodging: { r300: 2 } })).toContain(
      '반경 300m 안에 숙박시설 2곳이 있고 편의점은 자료에 없어요.',
    );
  });

  it('받지 못한 종류는 없다고 말하지 않고, 아무것도 없으면 시설 문장을 뺀다', () => {
    const body = buildReason({ ...base, nearby: { convenience: { r300: 1 } } }).body;
    expect(body).toContain('반경 300m 안에 편의점 1곳이 있어요.');
    expect(body).not.toContain('CCTV');
    expect(buildReason({ ...base, nearby: {} }).body).not.toContain('반경');
  });

  it('시설 출처는 모델·도로 출처 뒤에 붙는다', () => {
    expect(buildReason({ ...base, poiSources: ['편의점: 소상공인'] }).sources).toEqual([
      MODEL,
      LINK,
      '편의점: 소상공인',
    ]);
  });

  it('날씨: 반영(on)이면 관측 날씨 가산 문장과 출처, 관측 없음이면 빠졌다고 말하고, off면 말하지 않는다', () => {
    const on = buildReason({ ...base, weather: 'on' });
    expect(on.body).toContain('관측 날씨 가산이 들어간 값이에요.');
    expect(on.sources).toContain('기상청 AWS 관측');
    const none = buildReason({ ...base, weather: 'no_data' });
    expect(none.body).toContain('이 시각 관측 날씨가 없어 날씨 가산은 들어가지 않았어요.');
    expect(none.sources).not.toContain('기상청 AWS 관측');
    expect(buildReason({ ...base, weather: 'off' }).body).not.toContain('날씨');
    expect(buildReason(base).body).not.toContain('날씨');
  });

  it('금칙어(확률, 안전합니다, 안전해요)가 어떤 문장에도 없다', () => {
    const all = [...LINK_CASES, ...NGII_CASES].flatMap(([p]) =>
      (['standard_link', 'ngii_map'] as const).flatMap((r) =>
        (['off', 'on', 'no_data'] as const).map((w) => buildReason({ ...input(p, r), weather: w })),
      ),
    );
    all.push(buildReason(input(null, 'none')));
    for (const r of all) {
      const text = [r.headline, r.body, ...r.sources].join(' ');
      expect(text).not.toMatch(/확률|안전합니다|안전해요/);
    }
  });
});
