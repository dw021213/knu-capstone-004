import '@testing-library/jest-dom/vitest';

// Node 25는 전역 localStorage(--localstorage-file 없으면 메서드가 없는 빈 객체)를 두어 jsdom 것을 가린다.
// Node 버전과 무관하게 같은 동작을 하도록 메모리 저장소로 바꿔 끼운다.
class MemoryStorage implements Storage {
  #items = new Map<string, string>();
  get length() {
    return this.#items.size;
  }
  clear() {
    this.#items.clear();
  }
  getItem(key: string) {
    return this.#items.get(String(key)) ?? null;
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#items.delete(String(key));
  }
  setItem(key: string, value: string) {
    this.#items.set(String(key), String(value));
  }
}

if (typeof window !== 'undefined') {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(window, name, { value: new MemoryStorage(), configurable: true });
  }
}
