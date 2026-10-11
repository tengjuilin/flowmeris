import { useState } from 'react';
import {
  type CardOf,
  type PanelSpec,
  type PanelState,
  cardTitle,
  readPanelState,
  tabIds,
  toggleCard,
} from '../lib/settingsPanel.ts';

/**
 * UI preferences kept in browser storage: per tab for the session (sessionStorage: the open view, the
 * Gating path layout) or across sessions (localStorage: settings panels' tabs and collapsed cards). Storage can
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

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * A settings panel's tab and collapsed cards, remembered in this browser under `key`. Every card starts
 * open. A saved tab that is not one of `tabs` gives `fallback`.
 */
export function usePanelState<T extends string>(key: string, tabs: readonly T[], fallback: T) {
  const [panel, setPanel] = useState<PanelState<T>>(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {}
    return readPanelState(raw, tabs, fallback);
  });
  const change = (fn: (p: PanelState<T>) => PanelState<T>) =>
    setPanel((p) => {
      const next = fn(p);
      writeLocal(key, next);
      return next;
    });
  return {
    tab: panel.tab,
    setTab: (tab: T) => change((p) => ({ ...p, tab })),
    isOpen: (id: string) => !panel.closed.includes(id),
    toggle: (id: string) => change((p) => toggleCard(p, id)),
  };
}

/**
 * A settings panel's open tab and its cards' props (`card(id)`), remembered under the spec's key (or
 * `key`, for one spec shown in several views).
 */
export function useSettingsPanel<T extends string, C extends string>(spec: PanelSpec<T, C>, key = spec.key) {
  const { tab, setTab, isOpen, toggle } = usePanelState(key, tabIds(spec), spec.defaultTab);
  const card: CardOf<C> = (id, reset, title) => ({
    id: `${spec.idPrefix}-${id}`,
    title: title ?? cardTitle(spec, id) ?? id,
    open: isOpen(id),
    onToggle: () => toggle(id),
    ...reset,
  });
  return { tab, setTab, card };
}
