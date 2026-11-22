import { useId, useRef, type KeyboardEvent } from 'react';
import { matchRange, metaText, type Candidate } from './localSearch';
import type { SearchAction, SearchState } from './searchState';
import styles from './StopSearch.module.css';

interface StopSearchProps {
  state: SearchState;
  dispatch(a: SearchAction): void;
  /** 입력 중 추천 */
  suggestions: readonly Candidate[];
  kakaoOn: boolean;
  /** 장소가 다 찼을 때 */
  disabled?: boolean;
}

/** 이름에서 검색어와 맞는 부분만 굵게 */
export function Highlight({ name, query }: { name: string; query: string }) {
  const r = matchRange(name, query);
  if (!r) return <>{name}</>;
  return (
    <>
      {name.slice(0, r[0])}
      <strong>{name.slice(r[0], r[1])}</strong>
      {name.slice(r[1])}
    </>
  );
}

/** 한글 등 입력기 조합을 확정하는 엔터. Safari는 compositionend 뒤에 keyCode 229로 한 번 더 보낸다 */
const composing = (e: KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

/**
 * 내 코스 장소 검색창. 입력하면 추천 목록, 엔터·검색 버튼은 검색 결과 화면, 추천을 고르면 그 장소 카드.
 * 어느 조작도 장소를 코스에 바로 넣지 않는다
 */
export function StopSearch({
  state,
  dispatch,
  suggestions,
  kakaoOn,
  disabled = false,
}: StopSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;
  const active = state.mode === 'suggest' ? state.active : -1;
  const showList = state.mode === 'suggest' && suggestions.length > 0;
  const away = state.mode === 'results' || state.mode === 'place';

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (composing(e)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      dispatch({ type: 'move', by: e.key === 'ArrowDown' ? 1 : -1, count: suggestions.length });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      dispatch({ type: 'enter', suggestions });
    } else if (e.key === 'Escape' && state.mode !== 'idle') {
      e.preventDefault();
      dispatch({ type: 'escape' });
    }
  };

  return (
    <div className={styles.root} data-testid="stop-search">
      <div className={styles.box}>
        {away ? (
          <button
            type="button"
            className={styles.lead}
            aria-label="검색 닫기"
            onClick={() => dispatch({ type: 'close' })}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3 5 8l5 5" />
            </svg>
          </button>
        ) : (
          <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
        )}
        <label htmlFor={inputId} className="sr-only">
          장소 검색
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="장소, 주소 검색"
          value={state.query}
          disabled={disabled}
          onChange={(e) => dispatch({ type: 'type', query: e.target.value })}
          onFocus={() => dispatch({ type: 'focus' })}
          onKeyDown={onKeyDown}
          onBlur={() => dispatch({ type: 'blur' })}
        />
        {state.query && (
          <button
            type="button"
            className={styles.tool}
            aria-label="검색어 지우기"
            onClick={() => {
              dispatch({ type: 'type', query: '' });
              inputRef.current?.focus();
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className={styles.submit}
          disabled={disabled}
          onClick={() => dispatch({ type: 'submit' })}
        >
          검색
        </button>
      </div>
      {showList && (
        <ul id={listId} className={styles.list} role="listbox" aria-label="추천 장소">
          {suggestions.map((c, i) => (
            <li
              key={c.key}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              // 누르는 동안 입력창이 포커스를 잃어 목록이 닫히지 않게 한다
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => dispatch({ type: 'choose', place: c })}
            >
              <span className={styles.name}>
                <Highlight name={c.name} query={state.query} />
              </span>
              <span className={styles.meta}>{metaText(c)}</span>
            </li>
          ))}
        </ul>
      )}
      {!kakaoOn && (
        <p className={styles.hint} data-testid="kakao-off">
          카카오 장소 검색을 쓸 수 없어 읍면동 이름에서만 찾아요
        </p>
      )}
    </div>
  );
}
