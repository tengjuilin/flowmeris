/**
 * Settings panels: the tab and collapsed cards a panel remembers in this browser. Every card starts
 * open; only the cards the user collapsed are stored, so a card added later starts open too.
 */

/** A settings panel's remembered state. */
export interface PanelState<T extends string> {
  tab: T;
  /** The ids of the collapsed cards. */
  closed: string[];
}

/**
 * The panel state stored as `raw` (the stored string, or null when unset), or `{ tab: fallback,
 * closed: [] }`. Also reads the earlier formats: a bare tab id, and `{ tab, open }` where a card set to
 * false was collapsed. A tab that is not one of `tabs` falls back to `fallback`.
 */
export function readPanelState<T extends string>(
  raw: string | null,
  tabs: readonly T[],
  fallback: T,
): PanelState<T> {
  const valid = (t: unknown): T => (tabs.includes(t as T) ? (t as T) : fallback);
  if (raw === null) return { tab: fallback, closed: [] };
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return { tab: valid(raw), closed: [] };
  }
  if (!saved || typeof saved !== 'object') return { tab: valid(saved), closed: [] };
  const s = saved as { tab?: unknown; closed?: unknown; open?: unknown };
  const closed = Array.isArray(s.closed)
    ? s.closed.filter((id): id is string => typeof id === 'string')
    : s.open && typeof s.open === 'object'
      ? Object.entries(s.open).flatMap(([id, open]) => (open === false ? [id] : []))
      : [];
  return { tab: valid(s.tab), closed };
}

/** `state` with card `id` collapsed if it was open, or opened if it was collapsed. */
export function toggleCard<T extends string>(state: PanelState<T>, id: string): PanelState<T> {
  const closed = state.closed.includes(id) ? state.closed.filter((c) => c !== id) : [...state.closed, id];
  return { ...state, closed };
}
