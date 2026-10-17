// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { findZipEntry, pickGeocode } from './fetch-poi-lib.mjs';

/** Nominatim jsonv2 결과 한 건(받은 모양 그대로) */
const result = (type, displayName, lat = '33.5', lon = '126.5', category = 'amenity') => ({
  lat,
  lon,
  category,
  type,
  display_name: displayName,
});

describe('pickGeocode', () => {
  it('주소 결과가 기대한 시설이면 그대로 쓴다', () => {
    const g = pickGeocode({
      address: '제주특별자치도 제주시  북성로 3',
      expectType: 'police',
      addressResults: [
        result('police', '제주동부경찰서 중앙지구대, 3, 북성로, 삼도이동, 제주시, 제주특별자치도'),
      ],
      nameQuery: '중앙지구대 제주',
      nameResults: [],
    });
    expect(g).toMatchObject({
      lat: 33.5,
      lng: 126.5,
      matchedBy: 'address',
      query: '제주특별자치도 제주시 북성로 3',
      osm: 'amenity=police',
    });
  });

  it('주소 결과가 시설이 아니면 이름 결과의 시설을 쓴다', () => {
    const g = pickGeocode({
      address: '제주특별자치도 서귀포시  신서귀로51번길 18',
      expectType: 'police',
      addressResults: [
        result('residential', '신서귀로51번길, 대천동, 서귀포시', '33.1', '126.1', 'highway'),
      ],
      nameQuery: '대신파출소 제주',
      nameResults: [
        result('police', '서귀포경찰서 대신파출소, 18, 신중남로, 서호동', '33.2', '126.2'),
      ],
    });
    expect(g).toMatchObject({ lat: 33.2, lng: 126.2, matchedBy: 'name', query: '대신파출소 제주' });
  });

  it('시설이 없어도 도로명과 건물번호가 맞는 주소 결과는 근사 좌표로 쓴다', () => {
    const g = pickGeocode({
      address: '제주특별자치도 제주시  신대로 97',
      expectType: 'police',
      addressResults: [
        result(
          'public',
          '연동지구대, 97, 신대로, 연동, 신제주, 제주시',
          '33.48',
          '126.49',
          'office',
        ),
      ],
      nameQuery: '연동지구대 제주',
      nameResults: [],
    });
    expect(g).toMatchObject({ matchedBy: 'address-approx', lat: 33.48 });
  });

  it('동 중심점처럼 건물번호가 없는 결과는 버린다', () => {
    const g = pickGeocode({
      address: '제주특별자치도 내도동 723',
      expectType: 'police',
      addressResults: [
        result('suburb', '내도동, 외도동, 제주시, 제주특별자치도', '33.49', '126.43', 'place'),
      ],
      nameQuery: '외도파출소 제주',
      nameResults: [],
    });
    expect(g).toBeNull();
  });

  it('제주 밖 결과는 쓰지 않는다', () => {
    const g = pickGeocode({
      address: '제주특별자치도 제주시 북성로 3',
      expectType: 'police',
      addressResults: [result('police', '중앙지구대, 3, 북성로', '37.5', '127.0')],
      nameQuery: '중앙지구대 제주',
      nameResults: [],
    });
    expect(g).toBeNull();
  });
});

/** 저장(stored) 또는 deflate 항목을 가진 작은 zip을 만든다. 이름 바이트와 UTF-8 플래그를 고를 수 있다 */
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { nameBytes, utf8Flag, data } of entries) {
    const comp = deflateRawSync(data);
    const flag = utf8Flag ? 0x800 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(flag, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(flag, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    const part = Buffer.concat([local, nameBytes, comp]);
    locals.push(part);
    centrals.push(Buffer.concat([central, nameBytes]));
    offset += part.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const reader = (buf) => ({
  size: buf.length,
  read: (pos, len) => buf.subarray(pos, pos + len),
});

describe('findZipEntry', () => {
  // '제주' = CP949 C1A6 C1D6
  const cp949Jeju = Buffer.from([0xc1, 0xa6, 0xc1, 0xd6]);

  it('UTF-8 플래그가 없는 CP949 이름을 읽어 항목을 찾고 푼다', () => {
    const zip = makeZip([
      { nameBytes: Buffer.from('a_seoul_.csv'), utf8Flag: false, data: Buffer.from('x') },
      {
        nameBytes: Buffer.concat([Buffer.from('a_'), cp949Jeju, Buffer.from('_.csv')]),
        utf8Flag: false,
        data: Buffer.from('상가,편의점\n'),
      },
    ]);
    const { name, bytes } = findZipEntry(reader(zip), (n) => n.includes('_제주_'));
    expect(name).toBe('a_제주_.csv');
    expect(bytes.toString('utf8')).toBe('상가,편의점\n');
  });

  it('UTF-8 플래그가 있으면 UTF-8로 읽는다', () => {
    const zip = makeZip([
      { nameBytes: Buffer.from('b_제주_.csv'), utf8Flag: true, data: Buffer.from('y') },
    ]);
    expect(findZipEntry(reader(zip), (n) => n.includes('_제주_')).name).toBe('b_제주_.csv');
  });

  it('맞는 항목이 없으면 실패한다', () => {
    const zip = makeZip([
      { nameBytes: Buffer.from('c.csv'), utf8Flag: true, data: Buffer.from('z') },
    ]);
    expect(() => findZipEntry(reader(zip), () => false)).toThrow(/찾지 못함/);
  });
});
