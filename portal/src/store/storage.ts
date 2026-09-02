/** Tiny persistence boundary. Swap `load`/`save` for real API calls when wiring the backend. */
const KEY = "ee.portal.v2";

export interface PersistedSlice<T> {
  version: number;
  data: T;
}

export function load<T>(fallback: T, version = 1): T {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PersistedSlice<T>;
    if (parsed.version !== version) return fallback;
    return { ...fallback, ...parsed.data };
  } catch {
    return fallback;
  }
}

export function save<T>(data: T, version = 1): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version, data } satisfies PersistedSlice<T>));
  } catch {
    /* quota or private mode: ignore */
  }
}

export function reset(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
