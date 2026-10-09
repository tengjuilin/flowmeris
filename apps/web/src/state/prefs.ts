/**
 * UI preferences kept in browser storage: per tab for the session (sessionStorage: the open view, the
 * Gating path layout) or across sessions (localStorage: inspector tabs and open sections). Storage can
 * be unavailable (private windows, blocked site data): reads then fall back and writes are dropped.
 */

/** A session preference that must be one of `valid`; `fallback` when unset or unknown. */
export function readSession<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  try {
    const v = sessionStorage.getItem(key) as T | null;
    return v !== null && valid.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

/** A saved JSON preference, or undefined when unset, unreadable or not JSON. */
export function readLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
