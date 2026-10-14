/**
 * Keyboard shortcuts: every action the app binds to a key, their default keys, and the user's own keys.
 *
 * A key combination is a string of modifiers, then the key, joined by "+": `Mod+Shift+Z`, `Alt+ArrowLeft`,
 * `V`, `Delete`, `+`. `Mod` is ⌘ on a Mac and Ctrl elsewhere (either is accepted on both, so settings files
 * work on both). A letter is upper case; another printable character is the character typed, without
 * Shift (Shift+= is `+`).
 */

export type HotkeyScope = 'general' | 'tools' | 'grid' | 'gate' | 'polygon';

export interface HotkeyAction {
  id: string;
  label: string;
  scope: HotkeyScope;
  keys: readonly string[];
  /** Shift with the key does the same, ten times as far (the nudges); a key set for it never has Shift. */
  shiftBoost?: boolean;
}

export const HOTKEY_SCOPES: { id: HotkeyScope; title: string; note?: string }[] = [
  { id: 'general', title: 'General' },
  { id: 'tools', title: 'Gate tools', note: 'In the Gate, Plot grid and Tiles views.' },
  { id: 'grid', title: 'Plot grid', note: 'When no gate is selected.' },
  { id: 'gate', title: 'Selected gate', note: 'Shift with a nudge key moves 10 px.' },
  { id: 'polygon', title: 'Drawing a polygon' },
];

export const HOTKEY_ACTIONS = [
  { id: 'undo', label: 'Undo', scope: 'general', keys: ['Mod+Z'] },
  { id: 'redo', label: 'Redo', scope: 'general', keys: ['Mod+Shift+Z'] },
  { id: 'back', label: 'Back', scope: 'general', keys: ['Alt+ArrowLeft'] },
  { id: 'forward', label: 'Forward', scope: 'general', keys: ['Alt+ArrowRight'] },
  { id: 'tool.select', label: 'Select', scope: 'tools', keys: ['V'] },
  { id: 'tool.rect', label: 'Rectangle', scope: 'tools', keys: ['R'] },
  { id: 'tool.ellipse', label: 'Ellipse', scope: 'tools', keys: ['E'] },
  { id: 'tool.polygon', label: 'Polygon', scope: 'tools', keys: ['P'] },
  { id: 'tool.quadrant', label: 'Quadrant', scope: 'tools', keys: ['Q'] },
  { id: 'tool.spider', label: 'Spider', scope: 'tools', keys: ['S'] },
  { id: 'tool.range', label: 'Range', scope: 'tools', keys: ['H'] },
  { id: 'tool.split', label: 'Bisector', scope: 'tools', keys: ['B'] },
  { id: 'grid.cut', label: 'Cut plot', scope: 'grid', keys: ['Mod+X'] },
  { id: 'grid.copy', label: 'Copy plot', scope: 'grid', keys: ['Mod+C'] },
  { id: 'grid.paste', label: 'Paste plot', scope: 'grid', keys: ['Mod+V'] },
  { id: 'grid.delete', label: 'Delete plot', scope: 'grid', keys: ['Delete', 'Backspace'] },
  { id: 'grid.cancelCut', label: 'Cancel cut', scope: 'grid', keys: ['Escape'] },
  { id: 'gate.delete', label: 'Delete gate', scope: 'gate', keys: ['Delete', 'Backspace'] },
  { id: 'gate.deselect', label: 'Deselect gate', scope: 'gate', keys: ['Escape'] },
  { id: 'gate.left', label: 'Nudge left', scope: 'gate', keys: ['ArrowLeft'], shiftBoost: true },
  { id: 'gate.right', label: 'Nudge right', scope: 'gate', keys: ['ArrowRight'], shiftBoost: true },
  { id: 'gate.up', label: 'Nudge up', scope: 'gate', keys: ['ArrowUp'], shiftBoost: true },
  { id: 'gate.down', label: 'Nudge down', scope: 'gate', keys: ['ArrowDown'], shiftBoost: true },
  { id: 'polygon.close', label: 'Close polygon', scope: 'polygon', keys: ['Enter'] },
  { id: 'polygon.undoVertex', label: 'Remove last vertex', scope: 'polygon', keys: ['Backspace'] },
  { id: 'polygon.cancel', label: 'Cancel polygon', scope: 'polygon', keys: ['Escape'] },
] as const satisfies readonly HotkeyAction[];

export type HotkeyId = (typeof HOTKEY_ACTIONS)[number]['id'];
/** Every action's keys. */
export type Hotkeys = Record<HotkeyId, string[]>;
/** Keys the user changed, by action; the others keep their default keys. */
export type HotkeyOverrides = Partial<Record<HotkeyId, string[]>>;

const ACTIONS = new Map<string, HotkeyAction>(HOTKEY_ACTIONS.map((a) => [a.id, a]));
export const hotkeyAction = (id: HotkeyId): HotkeyAction => ACTIONS.get(id)!;
export const isHotkeyId = (id: string): id is HotkeyId => ACTIONS.has(id);

export const DEFAULT_HOTKEYS: Hotkeys = Object.fromEntries(
  HOTKEY_ACTIONS.map((a) => [a.id, [...a.keys]]),
) as Hotkeys;

/** Every action's keys: the user's where set, else the defaults. */
export const resolveHotkeys = (o: HotkeyOverrides): Hotkeys =>
  Object.fromEntries(HOTKEY_ACTIONS.map((a) => [a.id, [...(o[a.id] ?? a.keys)]])) as Hotkeys;

/** The overrides that give `keys`: only actions whose keys differ from their defaults. */
export function hotkeyOverrides(keys: Hotkeys): HotkeyOverrides {
  const o: HotkeyOverrides = {};
  for (const a of HOTKEY_ACTIONS) {
    const k = keys[a.id];
    if (k.length !== a.keys.length || k.some((x, i) => x !== a.keys[i])) o[a.id] = [...k];
  }
  return o;
}

const MODIFIERS = ['Mod', 'Alt', 'Shift'] as const;
type Modifier = (typeof MODIFIERS)[number];

/** Keys that are only modifiers, and Tab, which always moves the focus. */
const NOT_BINDABLE = new Set(['Meta', 'Control', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'Fn', 'Tab', 'OS']);

/** The parts of a key combination; undefined when it is not one. */
export function parseCombo(combo: string): { mods: Set<Modifier>; key: string } | undefined {
  const mods = new Set<Modifier>();
  let rest = combo;
  for (;;) {
    const m = MODIFIERS.find((x) => rest.startsWith(`${x}+`) && rest.length > x.length + 1);
    if (!m || mods.has(m)) break;
    mods.add(m);
    rest = rest.slice(m.length + 1);
  }
  // The key: one character (a letter in upper case), or a key name such as ArrowLeft or F1.
  const single = [...rest].length === 1;
  if (single ? rest !== rest.toUpperCase() : !/^[A-Z][A-Za-z0-9]+$/.test(rest)) return undefined;
  if (NOT_BINDABLE.has(rest) || (MODIFIERS as readonly string[]).includes(rest)) return undefined;
  return { mods, key: rest };
}

export const isCombo = (combo: string) => parseCombo(combo) !== undefined;

/** What a key event needs to give its combination. */
export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The combination a key press gives, or null for a modifier alone (or Tab). With Alt on a Mac, `e.key` is
 * the character Alt types (Alt+← is still ArrowLeft), so a letter or digit is read from `code` when given.
 */
export function comboOf(e: KeyLike & { code?: string }): string | null {
  let key = e.key === ' ' ? 'Space' : e.key;
  if (e.altKey && e.code) {
    const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code);
    if (m) key = m[1] ?? m[2]!;
  }
  if (!key || NOT_BINDABLE.has(key) || key === 'Dead' || key === 'Unidentified') return null;
  const printable = [...key].length === 1;
  if (printable) key = key.toUpperCase();
  const mods: string[] = [];
  if (e.metaKey || e.ctrlKey) mods.push('Mod');
  if (e.altKey) mods.push('Alt');
  // A printable key's character already says whether Shift was held, except for letters.
  if (e.shiftKey && (!printable || /^[A-Z]$/.test(key))) mods.push('Shift');
  return [...mods, key].join('+');
}

/** `combo` without Shift. */
const withoutShift = (combo: string) => combo.replace(/(^|\+)Shift\+/, '$1');

/** Whether key press `e` runs action `id` with keys `keys`; a nudge also runs with Shift. */
export function hotkeyMatches(keys: Hotkeys, id: HotkeyId, e: KeyLike & { code?: string }): boolean {
  const c = comboOf(e);
  if (!c) return false;
  const list = keys[id];
  return list.includes(c) || (!!hotkeyAction(id).shiftBoost && e.shiftKey && list.includes(withoutShift(c)));
}

/** The first action of `ids` that key press `e` runs. */
export function matchHotkey<T extends HotkeyId>(
  keys: Hotkeys,
  ids: readonly T[],
  e: KeyLike & { code?: string },
): T | undefined {
  return ids.find((id) => hotkeyMatches(keys, id, e));
}

/**
 * Whether actions of scopes `a` and `b` can both run on one key press, so may not share a key. General
 * and tool keys work everywhere; the grid, a selected gate and a polygon being drawn each take keys only
 * while the others do not.
 */
export const scopesOverlap = (a: HotkeyScope, b: HotkeyScope) =>
  a === b || a === 'general' || b === 'general' || a === 'tools' || b === 'tools';

/** The actions other than `id` that would also run on `combo`. */
export function hotkeyConflicts(keys: Hotkeys, id: HotkeyId, combo: string): HotkeyId[] {
  const scope = hotkeyAction(id).scope;
  return HOTKEY_ACTIONS.filter(
    (a) => a.id !== id && scopesOverlap(scope, a.scope) && keys[a.id].includes(combo),
  ).map((a) => a.id);
}

/**
 * `keys` with action `id` set to the one key `combo` (Shift dropped for a nudge, whose Shift moves
 * farther), taken from any action it would conflict with.
 */
export function setHotkey(keys: Hotkeys, id: HotkeyId, combo: string): Hotkeys {
  const c = hotkeyAction(id).shiftBoost ? withoutShift(combo) : combo;
  const next = { ...keys, [id]: [c] };
  for (const other of hotkeyConflicts(keys, id, c)) next[other] = keys[other].filter((k) => k !== c);
  return next;
}

/** `keys` with action `id` back on its default keys, which are taken from actions they would conflict with. */
export function resetHotkey(keys: Hotkeys, id: HotkeyId): Hotkeys {
  let next: Hotkeys = { ...keys, [id]: [] };
  for (const k of hotkeyAction(id).keys) {
    for (const other of hotkeyConflicts(next, id, k))
      next = { ...next, [other]: next[other].filter((x) => x !== k) };
    next = { ...next, [id]: [...next[id], k] };
  }
  return next;
}

/** Whether to show keys the Mac way (⌘, ⌥, ⇧). */
export const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const KEY_NAMES: Record<string, [mac: string, other: string]> = {
  ArrowLeft: ['←', '←'],
  ArrowRight: ['→', '→'],
  ArrowUp: ['↑', '↑'],
  ArrowDown: ['↓', '↓'],
  Escape: ['Esc', 'Esc'],
  Enter: ['↩', 'Enter'],
  Backspace: ['⌫', 'Backspace'],
  Delete: ['⌦', 'Delete'],
  Space: ['Space', 'Space'],
};

/** A key combination as shown to the user: `⇧⌘Z` on a Mac, `Ctrl+Shift+Z` elsewhere. */
export function formatCombo(combo: string, mac = isMac()): string {
  const p = parseCombo(combo);
  if (!p) return combo;
  const key = KEY_NAMES[p.key]?.[mac ? 0 : 1] ?? p.key;
  if (mac)
    return `${p.mods.has('Alt') ? '⌥' : ''}${p.mods.has('Shift') ? '⇧' : ''}${p.mods.has('Mod') ? '⌘' : ''}${key}`;
  return [p.mods.has('Mod') && 'Ctrl', p.mods.has('Alt') && 'Alt', p.mods.has('Shift') && 'Shift', key]
    .filter(Boolean)
    .join('+');
}

/** An action's keys for a tooltip: " (⇧⌘Z)", or "" when it has none. */
export function keyHint(keys: Hotkeys, id: HotkeyId, mac = isMac()): string {
  const k = keys[id];
  return k.length ? ` (${k.map((c) => formatCombo(c, mac)).join(', ')})` : '';
}
