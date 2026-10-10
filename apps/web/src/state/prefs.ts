import { useState } from 'react';

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

/** An inspector's remembered tab and open sections. */
export interface PanelState<T extends string, S extends string> {
  tab: T;
  open: Partial<Record<S, boolean>>;
}

/**
 * An inspector's tab and open sections, remembered in this browser under `key`. A saved state whose tab
 * is not one of `tabs` is ignored. On load the saved open sections are laid over `keepOpen` (sections
 * that start open even when the saved state predates them); with nothing saved, `initial` is used.
 */
export function usePanelState<T extends string, S extends string>(
  key: string,
  tabs: readonly T[],
  initial: PanelState<T, S>,
  keepOpen: Partial<Record<S, boolean>>,
) {
  const [panel, setPanel] = useState<PanelState<T, S>>(() => {
    const saved = readLocal(key) as Partial<PanelState<T, S>> | null | undefined;
    return saved && saved.tab !== undefined && tabs.includes(saved.tab)
      ? { tab: saved.tab, open: { ...keepOpen, ...saved.open } }
      : initial;
  });
  const change = (fn: (p: PanelState<T, S>) => PanelState<T, S>) =>
    setPanel((p) => {
      const next = fn(p);
      writeLocal(key, next);
      return next;
    });
  return {
    tab: panel.tab,
    open: panel.open,
    setTab: (tab: T) => change((p) => ({ ...p, tab })),
    toggle: (id: S) => change((p) => ({ ...p, open: { ...p.open, [id]: !p.open[id] } })),
  };
}

/** A tab remembered in this browser under `key` (stored as plain text); `fallback` when unset or unknown. */
export function useRememberedTab<T extends string>(key: string, tabs: readonly T[], fallback: T) {
  const [tab, setTabState] = useState<T>(() => {
    try {
      const t = localStorage.getItem(key) as T | null;
      return t !== null && tabs.includes(t) ? t : fallback;
    } catch {
      return fallback;
    }
  });
  const setTab = (t: T) => {
    setTabState(t);
    try {
      localStorage.setItem(key, t);
    } catch {}
  };
  return [tab, setTab] as const;
}
