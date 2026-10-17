// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { JEJU_BOUNDS } from '../src/features/map/projection';
import {
  BOUNDS,
  POI_KINDS,
  buildAll,
  buildCctv,
  buildPolice,
  buildShop,
  normalizeAddress,
  parseCsv,
  serializeLayer,
} from './build-poi.mjs';

const RAW = new URL('../data-src/poi/', import.meta.url);
const OUT = new URL('../public/data/poi/', import.meta.url);
const KINDS = ['cctv', 'convenience', 'lodging', 'police', 'fire', 'er'];

const read = (kind) => JSON.parse(readFileSync(new URL(`${kind}.json`, OUT), 'utf8'));
const inJeju = ({ lat, lng }) =>
  lat >= JEJU_BOUNDS.south &&
  lat <= JEJU_BOUNDS.north &&
  lng >= JEJU_BOUNDS.west &&
  lng <= JEJU_BOUNDS.east;

describe('public/data/poi 정제본', () => {
  it('스크립트의 경계가 지도 JEJU_BOUNDS와 같다', () => {
    expect(BOUNDS).toEqual(JEJU_BOUNDS);
    expect(POI_KINDS).toEqual(KINDS);
  });

  it.each(KINDS)('%s.json이 있고 형식이 맞다', (kind) => {
    expect(existsSync(new URL(`${kind}.json`, OUT))).toBe(true);
    const file = read(kind);
    expect(file.type).toBe(kind);
    expect(['ready', 'pending']).toContain(file.status);
    expect(typeof file.source).toBe('string');
    expect(file.source.length).toBeGreaterThan(0);
    expect(Array.isArray(file.items)).toBe(true);
    if (file.status === 'pending') expect(file.items).toEqual([]);
  });

  it.each(KINDS)('%s: ready면 항목이 있고, 좌표가 제주 안이고, id가 고유하다', (kind) => {
    const file = read(kind);
    if (file.status !== 'ready') return;
    expect(file.items.length).toBeGreaterThan(0);
    expect(file.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const item of file.items) {
      expect(item.type).toBe(kind);
      expect(item.name.length).toBeGreaterThan(0);
      expect(inJeju(item), `${item.id} ${item.lat},${item.lng}`).toBe(true);
    }
    const ids = file.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('119안전센터는 24곳', () => {
    const file = read('fire');
    expect(file.status).toBe('ready');
    expect(file.items).toHaveLength(24);
  });

  it('숙박은 호텔/리조트와 여관/모텔 두 가지만 1,153곳', () => {
    const file = read('lodging');
    expect(new Set(file.items.map((i) => i.detail.kind))).toEqual(
      new Set(['호텔/리조트', '여관/모텔']),
    );
    expect(file.items).toHaveLength(1153);
  });

  it('CCTV 항목은 목적과 대수를 가진다', () => {
    const file = read('cctv');
    for (const item of file.items) {
      expect(typeof item.detail.purpose).toBe('string');
      expect(item.detail.cameras).toBeGreaterThan(0);
    }
  });

  it('정제본에 전화번호가 없다', () => {
    for (const kind of KINDS) {
      const text = readFileSync(new URL(`${kind}.json`, OUT), 'utf8');
      expect(text, kind).not.toMatch(/\d{2,3}-\d{3,4}-\d{4}/);
    }
  });

  it('커밋된 원본으로 다시 만든 결과가 커밋된 정제본과 같다', () => {
    const layers = buildAll(RAW);
    for (const kind of KINDS) {
      const committed = readFileSync(new URL(`${kind}.json`, OUT), 'utf8');
      expect(committed, kind).toBe(serializeLayer(layers[kind]));
    }
  });
});

describe('parseCsv', () => {
  it('따옴표 안의 쉼표와 따옴표, CRLF를 읽는다', () => {
    expect(parseCsv('a,b\r\n1,"x, ""y"""\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', 'x, "y"'],
    ]);
  });
});

describe('buildCctv', () => {
  const row = (lat, lng, purpose, cameras, addr = '제주특별자치도 제주시 연동 1') => ({
    관리기관명: '제주특별자치도',
    소재지도로명주소: '',
    소재지지번주소: addr,
    설치목적구분: purpose,
    카메라대수: cameras,
    위도: lat,
    경도: lng,
  });

  it('같은 좌표는 하나로 합쳐 대수를 더하고 목적은 다른 값만 잇는다', () => {
    const items = buildCctv([
      row('33.5', '126.5', '생활방범', '2'),
      row('33.500000', '126.500000', '교통단속', '1'),
      row('33.5', '126.5', '생활방범', '1'),
      row('33.4', '126.6', '시설물관리', ''),
    ]);
    expect(items).toHaveLength(2);
    const merged = items.find((i) => i.lat === 33.5);
    expect(merged.detail).toEqual({ purpose: '생활방범·교통단속', cameras: 4 });
    expect(items.find((i) => i.lat === 33.4).detail.cameras).toBe(1);
  });

  it('제주 밖 좌표와 빈 좌표는 뺀다', () => {
    expect(
      buildCctv([row('37.5', '127.0', '생활방범', '1'), row('', '', '생활방범', '1')]),
    ).toEqual([]);
  });

  it('이름은 도로명 주소, 없으면 지번 주소이고 시도명은 뺀다', () => {
    const [item] = buildCctv([row('33.5', '126.5', '생활방범', '1')]);
    expect(item.name).toBe('제주시 연동 1');
  });
});

describe('buildShop', () => {
  const shop = (no, name, branch, mid, small, lat = '33.5', lng = '126.5') => ({
    상가업소번호: no,
    상호명: name,
    지점명: branch,
    상권업종대분류명: mid,
    상권업종소분류명: small,
    경도: lng,
    위도: lat,
  });

  it('편의점은 소분류 편의점만, 같은 업소번호는 한 번만', () => {
    const items = buildShop(
      [
        shop('A1', 'CU', '제주연동점', '소매', '편의점'),
        shop('A1', 'CU', '제주연동점', '소매', '편의점'),
        shop('A2', '마트', '', '소매', '슈퍼마켓'),
      ],
      'convenience',
    );
    expect(items).toEqual([
      { id: 'convenience-A1', type: 'convenience', name: 'CU 제주연동점', lat: 33.5, lng: 126.5 },
    ]);
  });

  it('숙박은 24시간 운영하는 호텔/리조트와 여관/모텔만 남기고 소분류를 kind로 둔다', () => {
    const items = buildShop(
      [
        shop('B1', '바다펜션', '', '숙박', '펜션'),
        shop('B3', '한라호텔', '', '숙박', '호텔/리조트'),
        shop('B4', '별모텔', '', '숙박', '여관/모텔'),
        shop('B5', '숲캠핑', '', '숙박', '캠핑/글램핑'),
        shop('B6', '학생관', '', '숙박', '기숙사/고시원'),
        shop('B7', '기타숙소', '', '숙박', '그 외 기타 숙박업'),
      ],
      'lodging',
    );
    expect(items.map((i) => [i.id, i.detail.kind])).toEqual([
      ['lodging-B3', '호텔/리조트'],
      ['lodging-B4', '여관/모텔'],
    ]);
  });

  it('숙박도 좌표와 상호가 같으면 하나만 남긴다', () => {
    const items = buildShop(
      [
        shop('B1', '한라호텔', '', '숙박', '호텔/리조트'),
        shop('B2', '한라호텔', '', '숙박', '호텔/리조트'),
      ],
      'lodging',
    );
    expect(items.map((i) => i.id)).toEqual(['lodging-B1']);
  });
});

describe('buildPolice', () => {
  const rows = [
    {
      연번: '2022',
      시도청: '제주청',
      경찰서: '제주동부',
      관서명: '중앙',
      구분: '지구대',
      주소: 'A',
    },
    {
      연번: '2030',
      시도청: '제주청',
      경찰서: '제주동부',
      관서명: '추자',
      구분: '파출소',
      주소: 'B',
    },
    { 연번: '1', 시도청: '서울청', 경찰서: '서울중부', 관서명: '을지', 구분: '지구대', 주소: 'C' },
  ];

  it('제주청 행만, 이름은 경찰서와 관서, 좌표 없는 행은 뺀다', () => {
    const geocode = { A: { lat: 33.51, lng: 126.52 }, B: null };
    expect(buildPolice(rows, geocode)).toEqual([
      {
        id: 'police-2022',
        type: 'police',
        name: '제주동부경찰서 중앙지구대',
        lat: 33.51,
        lng: 126.52,
        detail: { kind: '지구대', address: 'A' },
      },
    ]);
  });
});

describe('normalizeAddress', () => {
  it('겹친 공백, 반복 낱말, 끝의 기관명, 괄호를 정리한다', () => {
    expect(normalizeAddress('제주특별자치도 제주시  북성로 3')).toBe(
      '제주특별자치도 제주시 북성로 3',
    );
    expect(normalizeAddress('제주특별자치도 제주시 조천읍 신북로 신북로 515')).toBe(
      '제주특별자치도 제주시 조천읍 신북로 515',
    );
    expect(normalizeAddress('제주특별자치도 서귀포시 성산읍 성산중앙로 53 성산파출소')).toBe(
      '제주특별자치도 서귀포시 성산읍 성산중앙로 53',
    );
    expect(normalizeAddress('제주특별자치도 제주시 도령로 65(연동)')).toBe(
      '제주특별자치도 제주시 도령로 65',
    );
  });
});
