import { useId, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EMD_QUERY_KEY, fetchEmd, searchEmd, type EmdItem } from '../../entities/place/emd';
import styles from './PlaceSearch.module.css';

/** 받침이 있으면 '과', 없으면 '와'(한글이 아니면 '와') */
function andParticle(word: string): string {
  const c = word.trim().at(-1)?.charCodeAt(0) ?? 0;
  if (c < 0xac00 || c > 0xd7a3) return '와';
  return (c - 0xac00) % 28 === 0 ? '와' : '과';
}

interface PlaceSearchProps {
  /** 목록에서 고른 읍면동 */
  onPick(item: EmdItem, input: HTMLInputElement): void;
}

/** 상단 읍면동 이름 검색(배포본 안의 목록에서 찾는다). 결과는 저장하지 않는다 */
export function PlaceSearch({ onPick }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // 처음 포커스할 때 목록 파일을 받는다
  const [wanted, setWanted] = useState(false);
  const { data: emd } = useQuery({ queryKey: EMD_QUERY_KEY, queryFn: fetchEmd, enabled: wanted });
  const inputId = useId();
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;

  const results = emd ? searchEmd(emd.items, query) : [];
  const typed = query.trim().length > 0;
  const showList = open && results.length > 0;
  const noMatch = open && typed && emd !== undefined && results.length === 0;

  const pick = (item: EmdItem, input: HTMLInputElement) => {
    setQuery(`${item.sgg} ${item.name}`);
    setOpen(false);
    setActive(-1);
    onPick(item, input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const n = results.length;
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === 'Enter') {
      if (!showList) return;
      e.preventDefault();
      pick(results[active >= 0 ? active : 0], e.currentTarget);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (query) {
        setQuery('');
      }
    }
  };

  return (
    <div className={styles.root}>
      <label htmlFor={inputId} className="sr-only">
        읍면동 검색
      </label>
      <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <input
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
        placeholder="읍면동 이름 (예: 애월, 이도2동)"
        value={query}
        onFocus={() => setWanted(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {showList && (
        <ul id={listId} className={styles.list} role="listbox" aria-label="읍면동 검색 결과">
          {results.map((item, i) => (
            <li
              key={item.code}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              // 누르는 동안 입력창이 포커스를 잃어 목록이 닫히지 않게 한다
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const input = document.getElementById(inputId) as HTMLInputElement;
                pick(item, input);
              }}
            >
              <span className={styles.name}>{item.name}</span>
              <span className={styles.sgg}>{item.sgg}</span>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className={noMatch ? styles.empty : 'sr-only'}>
        {noMatch ? `'${query.trim()}'${andParticle(query)} 일치하는 읍면동이 없어요` : ''}
      </p>
    </div>
  );
}
