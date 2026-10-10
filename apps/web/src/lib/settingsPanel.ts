/**
 * Settings panels: what a panel is (its tabs and their cards, declared once in `panelSpecs.ts`), and
 * the tab and collapsed cards it remembers in this browser. Every card starts open; only the cards the
 * user collapsed are stored, so a card added later starts open too.
 */

/** One tab of a settings panel: its label and its cards (card id → title), top to bottom. */
export interface PanelTab<T extends string, C extends string> {
  id: T;
  label: string;
  cards: Partial<Record<C, string>>;
}

/**
 * A settings panel: its tabs (`T`) and the cards in them (`C`). Rendered by `SettingsPanel`
 * (`components/ui/settings`) with the state of `useSettingsPanel` (`state/prefs.ts`).
 */
export interface PanelSpec<T extends string, C extends string> {
  /** Where the tab and collapsed cards are remembered (localStorage). */
  key: string;
  /** Prefix of the panel's element ids: `${idPrefix}-tab-${tab}`, `${idPrefix}-tabpanel`, cards `${idPrefix}-${card}`. */
  idPrefix: string;
  /** The panel's accessible name, e.g. 'Chart settings'. */
  name: string;
  /** What the panel edits, e.g. 'chart': "Reset the settings in this panel for this chart". */
  noun: string;
  defaultTab: T;
  tabs: readonly PanelTab<T, C>[];
}

/** The props of a card (`Card` in `components/ui/settings`). */
export interface CardProps {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Whether any setting in the card differs from its default; enables the reset button. */
  changed?: boolean;
  /** Leave out to show no reset button. */
  onReset?: () => void;
}

/** A card's reset button: whether its settings changed, and how to reset them. */
export interface CardReset {
  changed: boolean;
  onReset: () => void;
}

/**
 * The props of card `id` of a panel, with its reset button if `reset` is given. `title` names a card
 * that is not in the spec (one per gate, say); a card in the spec takes the spec's title.
 */
export type CardOf<C extends string> = (id: C, reset?: CardReset, title?: string) => CardProps;

/** The ids of the tabs of `spec`, in order. */
export const tabIds = <T extends string, C extends string>(spec: PanelSpec<T, C>): T[] =>
  spec.tabs.map((t) => t.id);

/** The label of tab `tab` of `spec`. */
export const tabLabel = <T extends string, C extends string>(spec: PanelSpec<T, C>, tab: T): string =>
  spec.tabs.find((t) => t.id === tab)?.label ?? tab;

/** The cards of tab `tab` of `spec`, top to bottom. */
export const cardsOfTab = <T extends string, C extends string>(spec: PanelSpec<T, C>, tab: T): C[] =>
  Object.keys(spec.tabs.find((t) => t.id === tab)?.cards ?? {}) as C[];

/** The title of card `id` in `spec`, or undefined when the spec does not list it. */
export function cardTitle<T extends string, C extends string>(
  spec: PanelSpec<T, C>,
  id: C,
): string | undefined {
  for (const t of spec.tabs) {
    const title = t.cards[id];
    if (title !== undefined) return title;
  }
  return undefined;
}

/** What is wrong with `spec`: repeated tab or card ids, an unknown default tab. Empty when nothing is. */
export function specProblems<T extends string, C extends string>(spec: PanelSpec<T, C>): string[] {
  const out: string[] = [];
  const tabs = tabIds(spec);
  if (new Set(tabs).size !== tabs.length) out.push(`${spec.name}: a tab id is repeated`);
  if (!tabs.includes(spec.defaultTab)) out.push(`${spec.name}: unknown default tab ${spec.defaultTab}`);
  const cards = spec.tabs.flatMap((t) => Object.keys(t.cards));
  for (const c of new Set(cards))
    if (cards.filter((x) => x === c).length > 1) out.push(`${spec.name}: card ${c} is in several tabs`);
  return out;
}

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
