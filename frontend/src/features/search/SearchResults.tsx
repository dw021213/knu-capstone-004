import { useEffect, useId, useRef, type ReactNode } from 'react';
import { MAX_STOPS } from '../../entities/my-course/store';
import { metaText, type Candidate } from './localSearch';
import type { Results } from './usePlaceSearch';
import styles from './SearchResults.module.css';

/** 한 쪽 결과 15건의 줄·지도 표지 글자 */
export const LETTERS = 'ABCDEFGHIJKLMNO';

interface PlaceCardProps {
  place: Candidate;
  /** 검색 결과에서 고른 곳이면 그 글자 */
  letter?: string;
  /** 넣을 수 없을 때 까닭(버튼을 끈다) */
  blocked?: string | null;
  addLabel?: string;
  closeLabel: string;
  onAdd(): void;
  onClose(): void;
}

/** 고른 장소 카드: 이름, 분류·주소, 코스에 추가 */
export function PlaceCard({
  place,
  letter,
  blocked = null,
  addLabel = '코스에 추가',
  closeLabel,
  onAdd,
  onClose,
}: PlaceCardProps) {
  const titleId = useId();
  return (
    <div className={styles.card} role="group" aria-labelledby={titleId} data-testid="place-card">
      <div className={styles.cardHead}>
        {letter && (
          <span className={styles.letter} data-active aria-hidden="true">
            {letter}
          </span>
        )}
        <h2 id={titleId} className={styles.cardName}>
          {place.name}
        </h2>
        <button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      </div>
      <p className={styles.cardMeta}>{metaText(place)}</p>
      <p role="status" className={blocked ? styles.blocked : 'sr-only'}>
        {blocked ?? ''}
      </p>
      <button type="button" className={styles.primary} disabled={!!blocked} onClick={onAdd}>
        {addLabel}
      </button>
    </div>
  );
}

interface SearchResultsProps {
  query: string;
  results: Results;
  page: number;
  selected: number | null;
  kakaoOn: boolean;
  /** 이미 코스에 있는 장소 */
  isAdded(c: Candidate): boolean;
  /** 장소가 다 찼으면 */
  full: boolean;
  onSelect(i: number | null): void;
  onAdd(c: Candidate): void;
  onPage(page: number): void;
  onClose(): void;
}

/**
 * 검색 결과 목록(쪽마다 A~O 15건, 지도 표지와 같은 글자). 줄을 누르면 고르고, 추가 버튼으로 코스에 넣는다.
 * 모바일은 고른 장소가 있으면 목록 대신 그 장소 카드를 보인다(지도 표지를 누른 때)
 */
export function SearchResults({
  query,
  results,
  page,
  selected,
  kakaoOn,
  isAdded,
  full,
  onSelect,
  onAdd,
  onPage,
  onClose,
}: SearchResultsProps) {
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const metaId = useId();
  useEffect(() => {
    if (selected !== null) rowRefs.current[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const q = query.trim();
  const { items, total, capped, pages, loading } = results;
  const picked = selected !== null ? items[selected] : undefined;
  let status: ReactNode = null;
  if (loading) status = '찾는 중이에요';
  else if (items.length === 0)
    status = `‘${q}’ 검색 결과가 없어요. 지도를 눌러 직접 더할 수도 있어요.`;

  const addText = (c: Candidate) => (isAdded(c) ? '추가됨' : '추가');

  return (
    <div
      className={styles.results}
      data-card={picked ? '' : undefined}
      data-testid="search-results"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles.listView}>
        <h2 className={styles.head}>
          ‘{q}’ 검색 결과{' '}
          {!loading && (
            <strong data-testid="result-total">
              {total}건{capped ? ' 이상' : ''}
            </strong>
          )}
        </h2>
        {!kakaoOn && (
          <p className={styles.note}>카카오 장소 검색을 쓸 수 없어 읍면동 이름에서만 찾았어요.</p>
        )}
        <p role="status" className={status ? styles.status : 'sr-only'}>
          {status}
        </p>
        {items.length > 0 && (
          <ol className={styles.list} aria-label="검색 결과">
            {items.map((c, i) => {
              const letter = LETTERS[i];
              const added = isAdded(c);
              return (
                <li
                  key={c.key}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className={styles.row}
                  aria-current={i === selected ? 'true' : undefined}
                  data-testid="result-row"
                >
                  <button
                    type="button"
                    className={styles.rowMain}
                    aria-describedby={`${metaId}-${i}`}
                    onClick={() => onSelect(i)}
                  >
                    <span
                      className={styles.letter}
                      data-active={i === selected || undefined}
                      aria-hidden="true"
                    >
                      {letter}
                    </span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowName}>
                        <span className="sr-only">{letter}, </span>
                        {c.name}
                      </span>
                      {/* 이름표는 'A, 이름'만 읽고 분류·주소는 설명으로 읽는다 */}
                      <span id={`${metaId}-${i}`} className={styles.rowMeta} aria-hidden="true">
                        {metaText(c)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.add}
                    disabled={added || full}
                    aria-label={`${letter} ${c.name} ${addText(c)}`}
                    onClick={() => onAdd(c)}
                  >
                    {addText(c)}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {pages > 1 && (
          <nav className={styles.pager} aria-label="결과 쪽">
            <button
              type="button"
              className={styles.pageButton}
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              이전 결과
            </button>
            <span className={styles.pageNo}>
              {page} / {pages}쪽
            </span>
            <button
              type="button"
              className={styles.pageButton}
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
            >
              다음 결과
            </button>
          </nav>
        )}
      </div>
      {picked && selected !== null && (
        <div className={styles.cardView}>
          <PlaceCard
            place={picked}
            letter={LETTERS[selected]}
            blocked={
              isAdded(picked)
                ? '이미 코스에 넣은 장소예요'
                : full
                  ? `장소는 ${MAX_STOPS}곳까지 넣을 수 있어요.`
                  : null
            }
            addLabel={isAdded(picked) ? '추가됨' : '코스에 추가'}
            closeLabel="목록 보기"
            onAdd={() => onAdd(picked)}
            onClose={() => onSelect(null)}
          />
        </div>
      )}
    </div>
  );
}
