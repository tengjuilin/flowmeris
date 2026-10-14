import type { ChartStyle, Group, PlotFigure, PlotStyle, RidgeStyle, Workspace } from '@flowmeris/model';
import { FACTORY_CHART_STYLE, setChartDefaults } from '../chartStyle.ts';
import {
  FACTORY_FIGURE,
  FACTORY_STYLE,
  FACTORY_TILE_SIZES,
  type TileSizes,
  setPlotDefaults,
} from '../figure.ts';
import { jsonClone, sameJson } from '../json.ts';
import { FACTORY_OVERLAP, FACTORY_RIDGE_STYLE, setRidgeDefaults } from '../ridgeStyle.ts';
import { type DefaultsSection, SECTION_FIELDS, validField } from './defaultsSpec.ts';

/** The default appearance of new plots, ridges and charts, by section of `DEFAULTS_TABS`. */
export interface AppDefaults {
  plot: PlotStyle;
  figure: PlotFigure;
  tile: TileSizes;
  ridge: RidgeStyle;
  ridgeLayout: { overlap: number };
  chart: ChartStyle;
}

/** The user's changes to the factory defaults: only the fields set, by section. */
export type DefaultsOverrides = Partial<Record<DefaultsSection, Record<string, unknown>>>;

export const FACTORY_DEFAULTS: AppDefaults = {
  plot: FACTORY_STYLE,
  figure: FACTORY_FIGURE,
  tile: FACTORY_TILE_SIZES,
  ridge: FACTORY_RIDGE_STYLE,
  ridgeLayout: { overlap: FACTORY_OVERLAP },
  chart: FACTORY_CHART_STYLE,
};

const SECTIONS = Object.keys(SECTION_FIELDS) as DefaultsSection[];

/** The factory defaults with `o` applied; an unset optional color is stored as `null`. */
export function resolveDefaults(o: DefaultsOverrides): AppDefaults {
  const d = jsonClone(FACTORY_DEFAULTS) as unknown as Record<DefaultsSection, Record<string, unknown>>;
  for (const s of SECTIONS)
    for (const [k, v] of Object.entries(o[s] ?? {})) {
      if (v === null) delete d[s][k];
      else d[s][k] = v;
    }
  return d as unknown as AppDefaults;
}

/**
 * Overrides read from untrusted JSON (browser storage or a settings file): only known fields with valid
 * values are kept (`null` unsets an optional color); `dropped` counts the others.
 */
export function readDefaultsOverrides(raw: unknown): { overrides: DefaultsOverrides; dropped: number } {
  const overrides: DefaultsOverrides = {};
  let dropped = 0;
  if (!raw || typeof raw !== 'object') return { overrides, dropped: raw === undefined ? 0 : 1 };
  for (const [s, fields] of Object.entries(raw)) {
    const specs = SECTION_FIELDS[s as DefaultsSection];
    if (!specs || !fields || typeof fields !== 'object') {
      dropped++;
      continue;
    }
    for (const [k, v] of Object.entries(fields)) {
      const f = specs.find((x) => x.key === k);
      if (f && validField(f, v === null ? undefined : v)) {
        (overrides[s as DefaultsSection] ??= {})[k] = v;
      } else dropped++;
    }
  }
  return { overrides, dropped };
}

/** Field `key` of section `s` set to `v` (undefined: an optional color unset) in `o`, kept only where it differs from the factory. */
export function setDefault(
  o: DefaultsOverrides,
  s: DefaultsSection,
  key: string,
  v: unknown,
): DefaultsOverrides {
  const factory = (FACTORY_DEFAULTS[s] as Record<string, unknown>)[key];
  const fields = { ...o[s] };
  if (sameJson(v, factory)) delete fields[key];
  else fields[key] = v === undefined ? null : v;
  const next = { ...o, [s]: fields };
  if (Object.keys(fields).length === 0) delete next[s];
  return next;
}

/** The value of field `key` of section `s` in `d` (undefined: an optional color unset). */
export const defaultValue = (d: AppDefaults, s: DefaultsSection, key: string): unknown =>
  (d[s] as Record<string, unknown>)[key];

/** Make `d` the defaults every module reads (`DEFAULT_STYLE`, `DEFAULT_RIDGE_STYLE`, …). */
export function applyDefaults(d: AppDefaults) {
  setPlotDefaults(d.plot, d.figure, d.tile);
  setRidgeDefaults(d.ridge, d.ridgeLayout.overlap);
  setChartDefaults(d.chart);
}

type Obj = Record<string, unknown>;
const obj = (x: unknown) => x as Obj;

/**
 * Give every field of `o` (a style) that is still at its old default `from[k]` the new default `to[k]`,
 * for the fields of `keys`. Returns whether it changed anything.
 */
function follow(o: unknown, from: unknown, to: unknown, keys: readonly string[]): boolean {
  if (!o) return false;
  const [x, a, b] = [obj(o), obj(from), obj(to)];
  let changed = false;
  for (const k of keys) {
    if (sameJson(a[k], b[k]) || !sameJson(x[k], a[k])) continue;
    if (b[k] === undefined) delete x[k];
    else x[k] = jsonClone(b[k]);
    changed = true;
  }
  return changed;
}

const keysOf = (s: DefaultsSection) => SECTION_FIELDS[s].map((f) => f.key);
const FIGURE_KEYS = [...new Set([...keysOf('figure'), ...keysOf('tile')])];

/** A plot's style and the styles it keeps per channel pair. */
interface Restylable {
  style: PlotStyle;
  stylesByAxes?: Record<string, PlotStyle>;
  styleBase?: PlotStyle;
}

/**
 * Restyle plot `p` (a Gate-view plot, or with `tile` a Tiles or Plot grid plot) from defaults `from` to
 * `to`, as `restyleWorkspace` does. Returns whether anything changed.
 */
export function restylePlot(p: Restylable, from: AppDefaults, to: AppDefaults, tile: boolean): boolean {
  const figFrom = tile ? { ...from.figure, ...from.tile } : from.figure;
  const figTo = tile ? { ...to.figure, ...to.tile } : to.figure;
  let changed = false;
  for (const st of [p.style, ...Object.values(p.stylesByAxes ?? {}), p.styleBase]) {
    if (!st) continue;
    changed = follow(st, from.plot, to.plot, keysOf('plot')) || changed;
    changed = follow(st.figure, figFrom, figTo, FIGURE_KEYS) || changed;
  }
  return changed;
}

/**
 * Restyle the figures of `ws` that follow the defaults, from defaults `from` to `to`: each field still at
 * its old default takes the new one, and fields set to something else stay. A figure with no figure
 * options saved draws with the defaults anyway. Call inside `mutate`. Returns whether anything changed.
 */
export function restyleWorkspace(ws: Workspace, from: AppDefaults, to: AppDefaults): boolean {
  // Every style is visited (no short-circuit), so `some` is not used.
  return ws.groups.map((g) => restyleGroup(g, from, to)).includes(true);
}

/** `restyleWorkspace` for group `g`. */
function restyleGroup(g: Group, from: AppDefaults, to: AppDefaults): boolean {
  const ridge = (st: { style: RidgeStyle; overlap: number } | undefined) =>
    !!st &&
    [
      follow(st.style, from.ridge, to.ridge, keysOf('ridge')),
      follow(st, from.ridgeLayout, to.ridgeLayout, ['overlap']),
    ].includes(true);
  const results = [
    ...g.plots.map((p) => restylePlot(p, from, to, false)),
    ...g.refPlots.map((p) => restylePlot(p, from, to, false)),
    ...g.tilePlots.map((p) => restylePlot(p, from, to, true)),
    ...g.grid.cells.map((c) => !!c && restylePlot(c, from, to, true)),
    ...g.layouts.flatMap((l) =>
      l.kind === 'ridge' ? [l, ...Object.values(l.stylesByChannel ?? {}), l.styleBase].map(ridge) : [],
    ),
    ...g.statPlots.map((c) => follow(c.style, from.chart, to.chart, keysOf('chart'))),
  ];
  return results.includes(true);
}
