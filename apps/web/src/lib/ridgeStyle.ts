import {
  type Group,
  type RidgeCombine,
  RidgeCombineSchema,
  type RidgeLayout,
  type RidgeSettings,
  type RidgeStyle,
  RidgeStyleSchema,
} from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import { jsonClone, sameJson } from './json.ts';
import {
  type StyleScopes,
  applyShared,
  applyToScopes,
  carryShared,
  resetAllScopes,
  resetCurrentScope,
  resetScopeEverywhere,
  scopeAtDefaults,
  scopesAtDefaults,
  scopesMatch,
  setPerScope,
  sharedMatch,
  withScopeChange,
} from './styleScope.ts';

/** Ridge plot settings (style and overlap): defaults, per axis channel and across populations. */

export const DEFAULT_RIDGE_STYLE: RidgeStyle = RidgeStyleSchema.parse({});
export const DEFAULT_OVERLAP = 0.6;
export const DEFAULT_RIDGE_COMBINE: RidgeCombine = RidgeCombineSchema.parse({});

/** A copy of `c` that is safe to take of an Immer draft (`structuredClone` cannot clone one). */
export const copyCombine = (c: RidgeCombine): RidgeCombine => ({
  ...c,
  by: [...c.by],
  hidden: [...c.hidden],
  exclude: [...c.exclude],
});

/** The fill color of ridge `ridgeId`, the `index`th drawn: its own, else the palette's or the single color. */
export function ridgeColor(style: RidgeStyle, ridgeId: string, index: number): string {
  return (
    style.sampleColors[ridgeId] ??
    (style.colorMode === 'palette' ? CATEGORICAL[index % CATEGORICAL.length]! : style.color)
  );
}

/** Style keys that stay with each population's ridge plot when settings are carried or applied across populations. */
const PER_POPULATION = ['ticks', 'axisTitle'] as const;

const settingsOf = (l: RidgeLayout): RidgeSettings => ({ style: jsonClone(l.style), overlap: l.overlap });
const DEFAULT_SETTINGS: RidgeSettings = { style: DEFAULT_RIDGE_STYLE, overlap: DEFAULT_OVERLAP };

/** Whether `s` is the default ridge settings. */
export const isDefaultRidge = (s: RidgeSettings) =>
  sameJson(s.style, DEFAULT_RIDGE_STYLE) && s.overlap === DEFAULT_OVERLAP;

/** `from`'s settings with `to`'s per-population ones. */
function sharedRidge(from: RidgeLayout, to: RidgeLayout): RidgeSettings {
  const style = jsonClone(from.style);
  for (const k of PER_POPULATION) {
    if (to.style[k] === undefined) delete style[k];
    else (style as Record<string, unknown>)[k] = jsonClone(to.style[k]);
  }
  return { style, overlap: from.overlap };
}

/** A ridge plot's settings (style and overlap) are kept per axis channel (lib/styleScope.ts). */
const RIDGE_SCOPES: StyleScopes<RidgeLayout, RidgeSettings> = {
  scope: (l) => l.axis.channel,
  get: settingsOf,
  set: (l, s) => {
    l.style = jsonClone(s.style);
    l.overlap = s.overlap;
  },
  saved: (l) => l.stylesByChannel,
  setSaved: (l, saved) => void (l.stylesByChannel = saved),
};

/**
 * Opening population ridge plot `to` after `from` while settings are carried across populations: `to`
 * takes `from`'s settings, keeping its own ticks and axis title. Returns whether anything changed.
 */
export function carryRidge(from: RidgeLayout, to: RidgeLayout): boolean {
  return carryShared(RIDGE_SCOPES, sharedRidge, from, to);
}

const ridgeLayouts = (g: Group) => g.layouts.filter((l): l is RidgeLayout => l.kind === 'ridge');

/** Apply ridge plot `id`'s settings to every other population's ridge plot now (each keeps its ticks and axis title). */
export function applyRidgeToPopulations(g: Group, id: string) {
  applyShared(RIDGE_SCOPES, sharedRidge, ridgeLayouts(g), id);
}

/** Whether every other population's ridge plot already has ridge plot `id`'s settings. */
export function ridgePopulationsMatch(g: Group, id: string): boolean {
  return sharedMatch(RIDGE_SCOPES, sharedRidge, ridgeLayouts(g), id);
}

/**
 * Run `fn`, which changes `l`'s axis channel. The settings in use are saved under the old channel. While
 * settings are carried to plots (`styleFollow` not false) the new channel takes them over; otherwise it
 * gets back its saved settings (for a channel not used before, those last applied to every channel, else
 * the defaults). Returns whether `l`'s settings were replaced.
 */
export function withRidgeChannel(l: RidgeLayout, fn: () => void): boolean {
  return withScopeChange(RIDGE_SCOPES, l, DEFAULT_SETTINGS, fn);
}

/** Apply `l`'s current settings to every axis channel of its population now, including channels not used yet. */
export function applyRidgeToChannels(l: RidgeLayout) {
  applyToScopes(RIDGE_SCOPES, l);
}

/** Whether every axis channel of `l`'s population already has its current settings. */
export function ridgeChannelsMatch(l: RidgeLayout): boolean {
  return scopesMatch(RIDGE_SCOPES, l, isDefaultRidge);
}

/** Carry the settings in use to the channels opened next (on), or let each channel keep its own (off). */
export function setRidgeChannelStyles(l: RidgeLayout, perChannel: boolean) {
  setPerScope(l, perChannel);
}

/** Default settings for `l`'s current channel only. */
export function resetRidgeCurrent(l: RidgeLayout) {
  resetCurrentScope(RIDGE_SCOPES, l, DEFAULT_SETTINGS);
}

/** Default settings for `l` with every channel's saved settings dropped. */
export function resetRidgeLayout(l: RidgeLayout) {
  resetAllScopes(RIDGE_SCOPES, l, DEFAULT_SETTINGS);
}

/** Default settings for axis channel `ch` in every population's ridge plot, current or saved. */
export function resetRidgeChannel(g: Group, ch: string) {
  resetScopeEverywhere(RIDGE_SCOPES, ridgeLayouts(g), ch, DEFAULT_SETTINGS);
}

/** Default settings for every ridge plot of `g`. */
export function resetAllRidges(g: Group) {
  for (const l of ridgeLayouts(g)) resetRidgeLayout(l);
}

/** Whether `l` is at the defaults for its current, every saved and every unused channel. */
export const ridgeAtDefaults = (l: RidgeLayout) => scopesAtDefaults(RIDGE_SCOPES, l, isDefaultRidge);

/** Whether axis channel `ch` is at the defaults in every population's ridge plot. */
export const ridgeChannelAtDefaults = (g: Group, ch: string) =>
  scopeAtDefaults(RIDGE_SCOPES, ridgeLayouts(g), ch, isDefaultRidge);

/** Every ridge plot of `g` at the defaults. */
export const allRidgesAtDefaults = (g: Group) => ridgeLayouts(g).every(ridgeAtDefaults);
