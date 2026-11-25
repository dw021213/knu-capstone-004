// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { matchRange, metaText, searchLocal, type Candidate } from './localSearch';

const c = (name: string): Candidate => ({
  key: name,
  name,
  category: '읍면동',
  address: '제주시',
  lat: 33.4,
  lng: 126.5,
  source: 'emd',
});
const list = [c('한림읍'), c('애월읍'), c('한경면'), c('연동'), c('노형동')];

describe('searchLocal', () => {
  it('이름 앞이 맞는 장소를 먼저, 같은 순위는 목록 순서', () => {
    expect(searchLocal(list, '동', 10).map((x) => x.name)).toEqual(['연동', '노형동']);
    expect(searchLocal(list, '한', 10).map((x) => x.name)).toEqual(['한림읍', '한경면']);
  });

  it('띄어쓰기와 대소문자를 가리지 않고, 빈 검색어는 빈 목록', () => {
    expect(searchLocal(list, '애 월', 10).map((x) => x.name)).toEqual(['애월읍']);
    expect(searchLocal(list, '  ', 10)).toEqual([]);
  });

  it('최대 개수까지만', () => {
    expect(searchLocal(list, '읍', 1)).toHaveLength(1);
  });
});

describe('matchRange', () => {
  it('이름에서 검색어와 맞는 부분, 없으면 null', () => {
    expect(matchRange('제주국제공항', ' 공항 ')).toEqual([4, 6]);
    expect(matchRange('Jeju Airport', 'air')).toEqual([5, 8]);
    expect(matchRange('애월읍', '공항')).toBeNull();
  });
});

describe('metaText', () => {
  it('보이는 주소에서 앞의 제주특별자치도를 빼고, 장소의 주소 값은 그대로 둔다', () => {
    const airport = {
      ...c('제주국제공항'),
      category: '공항',
      address: '제주특별자치도 제주시 공항로 2',
    };
    expect(metaText(airport)).toBe('공항 · 제주시 공항로 2');
    expect(airport.address).toBe('제주특별자치도 제주시 공항로 2');
    expect(metaText(c('한림읍'))).toBe('읍면동 · 제주시');
    expect(metaText({ ...c('지점'), category: '지도에서 고른 곳', address: '' })).toBe(
      '지도에서 고른 곳',
    );
  });
});
