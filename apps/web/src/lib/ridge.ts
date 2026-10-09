import {
  type Group,
  type RidgeCombine,
  type RidgeLayout,
  type RidgeSettings,
  type RidgeStyle,
  RidgeStyleSchema,
  type Workspace,
} from '@flowmeris/model';
import { type Cell, compareCells } from '@flowmeris/table';
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

/** One ridge: a single sample, or replicates combined. `id` keys the ridge's order, colour and label. */
export interface RidgeRow {
  id: string;
  /** Default label (short sample name or the combined values). */
  label: string;
  sampleIds: string[];
}

/** `ids` in display order: those listed in `order` first, the rest in their given order. */
export function applyOrder(ids: string[], order: string[]): string[] {
  const all = new Set(ids);
  const head = order.filter((id) => all.has(id));
  const seen = new Set(head);
  return [...head, ...ids.filter((id) => !seen.has(id))];
}

/**
 * Replicates combined: one ridge per distinct combination of the `by` variables' values among
 * `sampleIds`, sorted by those values (categorical values in their level order). A sample without a
 * value forms its own combination with the others lacking it.
 */
export function comboRows(ws: Workspace, sampleIds: string[], by: string[]): RidgeRow[] {
  const vars = by.flatMap((id) => ws.variables.filter((v) => v.id === id));
  const groups = new Map<string, { values: Cell[]; ids: string[] }>();
  for (const sid of sampleIds) {
    const meta = ws.samples[sid]?.meta ?? {};
    const values = vars.map((v) => meta[v.id]);
    const id = `combo:${JSON.stringify(Object.fromEntries(vars.map((v, i) => [v.id, values[i] ?? null])))}`;
    const g = groups.get(id);
    if (g) g.ids.push(sid);
    else groups.set(id, { values, ids: [sid] });
  }
  const cmp = (a: Cell[], b: Cell[]) => {
    for (let i = 0; i < vars.length; i++) {
      const c = compareCells(a[i], b[i], vars[i]!.levels);
      if (c) return c;
    }
    return 0;
  };
  return [...groups.entries()]
    .sort(([, a], [, b]) => cmp(a.values, b.values))
    .map(([id, g]) => ({
      id,
      label: vars.length
        ? vars
            .map((v, i) => {
              const x = g.values[i];
              return x === undefined || x === '' ? `no ${v.name}` : `${x}${v.unit ? ` ${v.unit}` : ''}`;
            })
            .join(' · ')
        : 'All samples',
      sampleIds: g.ids,
    }));
}

/**
 * The combined ridges to draw: `hidden` ridges dropped, `exclude`d replicates removed from the others, and
 * ridges left without replicates dropped.
 */
export function selectRidges(rows: RidgeRow[], hidden: string[], exclude: string[]): RidgeRow[] {
  const off = new Set(hidden);
  const out = new Set(exclude);
  return rows.flatMap((r) => {
    if (off.has(r.id)) return [];
    const sampleIds = r.sampleIds.filter((id) => !out.has(id));
    return sampleIds.length ? [{ ...r, sampleIds }] : [];
  });
}

/** Event counts per bin (smoothed) of one sample on the shared axis. */
export interface BinCounts {
  centers: Float64Array;
  heights: Float64Array;
  eventsPlotted: number;
}

/** A ridge curve scaled to a mode of 1, with an optional spread band on the same scale. */
export interface RidgeCurve {
  centers: Float64Array;
  heights: Float64Array;
  band?: { lo: Float64Array; hi: Float64Array };
  /** Events over all replicates. */
  events: number;
  /** Replicates that contributed (those with events, for 'mean'). */
  n: number;
}

/**
 * Combine replicate histograms sharing the same bins (M-PLOT-RIDGE-COMBINE). 'pool' adds the counts;
 * 'mean' averages each replicate's unit-area histogram, so every replicate weighs the same, with an
 * optional ±SD or ±SEM (n − 1 denominator) band per bin. The result is scaled to a mode of 1. A single
 * histogram gives the usual mode-normalised curve.
 */
export function combineCounts(
  hs: BinCounts[],
  method: RidgeCombine['method'],
  band: RidgeCombine['band'],
): RidgeCurve | null {
  const first = hs[0];
  if (!first) return null;
  const nb = first.heights.length;
  const events = hs.reduce((a, h) => a + h.eventsPlotted, 0);
  const mean = new Float64Array(nb);
  let n = hs.length;
  let sd: Float64Array | null = null;
  if (method === 'pool' || hs.length === 1) {
    for (const h of hs) for (let k = 0; k < nb; k++) mean[k] = mean[k]! + h.heights[k]!;
  } else {
    const curves = hs.flatMap((h) => {
      let total = 0;
      for (let k = 0; k < nb; k++) total += h.heights[k]!;
      return total > 0 ? [h.heights.map((v) => v / total)] : [];
    });
    n = curves.length;
    for (const c of curves) for (let k = 0; k < nb; k++) mean[k] = mean[k]! + c[k]! / n;
    if (band !== 'none' && n > 1) {
      sd = new Float64Array(nb);
      for (const c of curves) for (let k = 0; k < nb; k++) sd[k] = sd[k]! + (c[k]! - mean[k]!) ** 2;
      const div = band === 'sem' ? (n - 1) * n : n - 1;
      for (let k = 0; k < nb; k++) sd[k] = Math.sqrt(sd[k]! / div);
    }
  }
  let max = 0;
  for (let k = 0; k < nb; k++) max = Math.max(max, mean[k]!);
  const s = max > 0 ? 1 / max : 0;
  const heights = mean.map((v) => v * s);
  return {
    centers: first.centers,
    heights,
    ...(sd && {
      band: {
        lo: heights.map((v, k) => Math.max(0, v - sd[k]! * s)),
        hi: heights.map((v, k) => v + sd[k]! * s),
      },
    }),
    events,
    n,
  };
}

/**
 * Break `text` into lines no wider than `maxW` by `measure`, at spaces and after `_ - . /`. A word
 * wider than `maxW` is broken between characters.
 */
export function wrapText(text: string, maxW: number, measure: (s: string) => number): string[] {
  const words = text.match(/[^\s_\-./]*[_\-./]?\s*/g)?.filter(Boolean) ?? [];
  const lines: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) lines.push(cur.trimEnd());
    cur = '';
  };
  for (const word of words) {
    if (cur && measure((cur + word).trimEnd()) > maxW) flush();
    if (!cur && measure(word.trimEnd()) > maxW) {
      for (const ch of word.trimEnd()) {
        if (cur && measure(cur + ch) > maxW) flush();
        cur += ch;
      }
    } else cur += word;
  }
  flush();
  return lines.length ? lines : [text];
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Width in px of a string at `fontSize` in `family`; estimated from the length where no canvas exists. */
export function textMeasure(
  fontSize: number,
  family: string,
  { bold = false, italic = false } = {},
): (s: string) => number {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  const ctx = measureCtx;
  if (!ctx) return (s) => s.length * fontSize * 0.55;
  return (s) => {
    ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${family}`;
    return ctx.measureText(s).width;
  };
}

export const DEFAULT_RIDGE_STYLE: RidgeStyle = RidgeStyleSchema.parse({});
export const DEFAULT_OVERLAP = 0.6;

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
