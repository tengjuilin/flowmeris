import { jsonClone, sameJson } from './json.ts';

/**
 * Settings kept per scope: a plot keeps its settings per channel pair, a ridge plot per axis channel.
 * While settings follow the plot (`styleFollow` not false) one set is used whatever the scope; with
 * `styleFollow: false` each scope keeps its own set in `saved`, and a scope not used yet starts from
 * `styleBase` (those last applied to every scope), else the defaults.
 *
 * figure.ts (plots, settings = PlotStyle) and ridge.ts (ridge plots, settings = style + overlap) are
 * thin wrappers around these functions.
 */

/** A holder of scoped settings: a plot or a ridge layout. */
export interface ScopedHolder<S> {
  styleFollow?: boolean | undefined;
  styleBase?: S | undefined;
}

/** How to read and write one kind of holder's settings. */
export interface StyleScopes<H extends ScopedHolder<S>, S> {
  /** Key of the scope `h` shows now (channel pair, channel). */
  scope(h: H): string;
  /** The settings in use; undefined when `h` keeps none (a plot that was never saved). */
  get(h: H): S | undefined;
  /** Replace the settings in use with a copy of `s`. */
  set(h: H, s: S): void;
  /** The settings saved per scope (`stylesByAxes`, `stylesByChannel`). */
  saved(h: H): Record<string, S> | undefined;
  setSaved(h: H, saved: Record<string, S> | undefined): void;
}

const savedOrNew = <H extends ScopedHolder<S>, S>(a: StyleScopes<H, S>, h: H): Record<string, S> => {
  let saved = a.saved(h);
  if (!saved) a.setSaved(h, (saved = {}));
  return saved;
};

/**
 * Run `fn`, which changes `h`'s scope. The settings in use are saved under the old scope. While settings
 * follow the plot the new scope takes them over; otherwise it gets back its saved settings (for a scope
 * not used before, `styleBase`, else `defaults`). Returns whether `h`'s settings were replaced.
 */
export function withScopeChange<H extends ScopedHolder<S>, S>(
  a: StyleScopes<H, S>,
  h: H,
  defaults: S,
  fn: () => void,
): boolean {
  const before = a.scope(h);
  const cur = a.get(h);
  const kept = cur === undefined ? undefined : jsonClone(cur);
  fn();
  const after = a.scope(h);
  if (kept === undefined || after === before) return false;
  const saved = savedOrNew(a, h);
  saved[before] = kept;
  if (h.styleFollow !== false) return false;
  a.set(h, saved[after] ?? h.styleBase ?? defaults);
  return true;
}

/** Apply `h`'s current settings to every scope now, including scopes not used yet. */
export function applyToScopes<H extends ScopedHolder<S>, S>(a: StyleScopes<H, S>, h: H) {
  a.setSaved(h, undefined);
  const cur = a.get(h);
  h.styleBase = cur === undefined ? undefined : jsonClone(cur);
}

/**
 * Whether every scope of `h` already has its current settings: every saved scope, and (with settings
 * kept per scope) the scopes not used yet, which have `styleBase` or else are at the defaults.
 */
export function scopesMatch<H extends ScopedHolder<S>, S>(
  a: StyleScopes<H, S>,
  h: H,
  isDefault: (s: S) => boolean,
): boolean {
  const cur = a.get(h);
  const key = a.scope(h);
  return (
    Object.entries(a.saved(h) ?? {}).every(([k, s]) => k === key || sameJson(s, cur)) &&
    (h.styleFollow !== false ||
      (h.styleBase ? sameJson(h.styleBase, cur) : cur !== undefined && isDefault(cur)))
  );
}

/** Carry the settings in use to the scopes opened next (off), or let each scope keep its own (on). */
export function setPerScope(h: ScopedHolder<unknown>, perScope: boolean) {
  h.styleFollow = perScope ? false : undefined;
}

/** `defaults` for `h`'s current scope only. */
export function resetCurrentScope<H extends ScopedHolder<S>, S>(a: StyleScopes<H, S>, h: H, defaults: S) {
  a.set(h, defaults);
}

/** `defaults` for `h`, with every scope's saved settings dropped. */
export function resetAllScopes<H extends ScopedHolder<S>, S>(a: StyleScopes<H, S>, h: H, defaults: S) {
  a.set(h, defaults);
  a.setSaved(h, undefined);
  h.styleBase = undefined;
}

/** `defaults` for scope `key` in every holder of `hs`, current or saved. */
export function resetScopeEverywhere<H extends ScopedHolder<S>, S>(
  a: StyleScopes<H, S>,
  hs: H[],
  key: string,
  defaults: S,
) {
  for (const h of hs) {
    if (a.scope(h) === key) a.set(h, defaults);
    else if (h.styleFollow === false || a.saved(h)?.[key]) savedOrNew(a, h)[key] = jsonClone(defaults);
  }
}

/** Whether `h` is at the defaults for its current, every saved and every unused scope. */
export function scopesAtDefaults<H extends ScopedHolder<S>, S>(
  a: StyleScopes<H, S>,
  h: H,
  isDefault: (s: S) => boolean,
): boolean {
  return [a.get(h), h.styleBase, ...Object.values(a.saved(h) ?? {})].every((s) => !s || isDefault(s));
}

/** Whether scope `key` is at the defaults in every holder of `hs`. */
export function scopeAtDefaults<H extends ScopedHolder<S>, S>(
  a: StyleScopes<H, S>,
  hs: H[],
  key: string,
  isDefault: (s: S) => boolean,
): boolean {
  return hs.every((h) => {
    const s =
      a.scope(h) === key ? a.get(h) : h.styleFollow === false ? (a.saved(h)?.[key] ?? h.styleBase) : a.get(h);
    return !s || isDefault(s);
  });
}

/**
 * Settings shared across populations: each population's holder keeps some settings of its own (title,
 * ticks, axis titles); `shared(from, to)` is `from`'s settings with `to`'s own ones.
 */
export type ShareSettings<H, S> = (from: H, to: H) => S;

/** Holder `to` takes `from`'s shared settings. Returns whether anything changed. */
export function carryShared<H extends ScopedHolder<S>, S>(
  a: StyleScopes<H, S>,
  shared: ShareSettings<H, S>,
  from: H,
  to: H,
): boolean {
  const next = shared(from, to);
  if (sameJson(next, a.get(to))) return false;
  a.set(to, next);
  return true;
}

/** Apply holder `id`'s shared settings to every other holder of `hs` now. */
export function applyShared<H extends ScopedHolder<S>, S>(
  a: StyleScopes<H, S>,
  shared: ShareSettings<H, S>,
  hs: (H & { id: string })[],
  id: string,
) {
  const src = hs.find((h) => h.id === id);
  if (!src) return;
  for (const h of hs) if (h.id !== id) a.set(h, shared(src, h));
}

/** Whether every other holder of `hs` already has holder `id`'s shared settings. */
export function sharedMatch<H extends ScopedHolder<S>, S>(
  a: StyleScopes<H, S>,
  shared: ShareSettings<H, S>,
  hs: (H & { id: string })[],
  id: string,
): boolean {
  const src = hs.find((h) => h.id === id);
  return !src || hs.every((h) => h.id === id || sameJson(shared(src, h), a.get(h)));
}
