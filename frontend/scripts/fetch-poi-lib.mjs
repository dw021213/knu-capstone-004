// fetch-poi.mjs의 네트워크와 무관한 판단 로직(테스트 대상)
import { inflateRawSync } from 'node:zlib';
import { BOUNDS, normalizeAddress } from './build-poi.mjs';

const inJeju = (lat, lng) =>
  lat >= BOUNDS.south && lat <= BOUNDS.north && lng >= BOUNDS.west && lng <= BOUNDS.east;

/** 주소의 도로명(…로, …길) 또는 동·리·읍·면 낱말 */
export const placeWords = (address) =>
  normalizeAddress(address)
    .split(' ')
    .filter((w) => /(로|길|동|리|읍|면)$/.test(w) && !/^(제주시|서귀포시)$/.test(w));

/**
 * Nominatim 결과 중 쓸 좌표를 고른다.
 * 1) 주소 결과가 기대한 시설(police/hospital)이면 그것, 2) 아니면 이름 결과의 시설,
 * 3) 그래도 없으면 주소 결과 중 도로명·동과 건물번호가 모두 맞는 것을 근사 좌표로.
 * 동 중심점처럼 건물번호가 없는 넓은 결과와 제주 밖 결과는 버리고, 없으면 null.
 */
export function pickGeocode({ address, expectType, addressResults, nameQuery, nameResults }) {
  const query = normalizeAddress(address);
  const inside = (rs) => rs.filter((r) => inJeju(Number(r.lat), Number(r.lon)));
  const hit = (r, q, matchedBy) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    query: q,
    matchedBy,
    osm: `${r.category}=${r.type}`,
    displayName: r.display_name,
  });
  const byAddress = inside(addressResults);
  const exact = byAddress.find((r) => r.type === expectType);
  if (exact) return hit(exact, query, 'address');
  const named = inside(nameResults).find((r) => r.type === expectType);
  if (named) return hit(named, nameQuery, 'name');
  const words = placeWords(address);
  const number = query.match(/(\d+(?:-\d+)?)$/)?.[1];
  const near = byAddress.find(
    (r) =>
      number &&
      r.display_name.split(', ').includes(number) &&
      words.some((w) => r.display_name.includes(w)),
  );
  return near ? hit(near, query, 'address-approx') : null;
}

/**
 * zip 안의 한 항목만 찾아 푼다(중앙 디렉터리를 읽어 해당 항목만 inflate).
 * 일반 플래그 11번 비트가 없으면 이름을 CP949로 읽는다(상가정보 zip이 그렇다).
 * @param {{ size: number, read: (pos: number, len: number) => Buffer }} zip
 * @param {(name: string) => boolean} match
 */
export function findZipEntry(zip, match) {
  const tailLen = Math.min(zip.size, 65557);
  const tail = zip.read(zip.size - tailLen, tailLen);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('zip 끝 레코드를 찾지 못함');
  const count = tail.readUInt16LE(eocd + 10);
  const cd = zip.read(tail.readUInt32LE(eocd + 16), tail.readUInt32LE(eocd + 12));
  let p = 0;
  for (let i = 0; i < count; i++) {
    const utf8Name = (cd.readUInt16LE(p + 8) & 0x800) !== 0;
    const method = cd.readUInt16LE(p + 10);
    const compSize = cd.readUInt32LE(p + 20);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localOffset = cd.readUInt32LE(p + 42);
    const name = new TextDecoder(utf8Name ? 'utf-8' : 'euc-kr')
      .decode(cd.subarray(p + 46, p + 46 + nameLen))
      .normalize('NFC');
    p += 46 + nameLen + extraLen + commentLen;
    if (!match(name)) continue;
    const local = zip.read(localOffset, 30);
    const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const data = zip.read(dataStart, compSize);
    return { name, bytes: method === 0 ? data : inflateRawSync(data) };
  }
  throw new Error('zip 안에서 파일을 찾지 못함');
}
