import {
  type PlotFigure,
  PlotFigureSchema,
  type PlotSpec,
  type PlotStyle,
  type TextStyle,
} from '@flowmeris/model';
import type { CSSProperties } from 'react';
import { jsonClone, sortedJson } from './json.ts';
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

export const FONT_GROUPS: { label: string; fonts: { id: string; label: string; stack: string }[] }[] = [
  {
    label: 'Sans-serif',
    fonts: [
      { id: 'sans', label: 'Sans-serif', stack: 'Inter, Helvetica, Arial, sans-serif' },
      { id: 'arial', label: 'Arial (default)', stack: 'Arial, "Liberation Sans", Helvetica, sans-serif' },
      { id: 'helvetica', label: 'Helvetica', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
      { id: 'calibri', label: 'Calibri', stack: 'Calibri, Carlito, "Segoe UI", sans-serif' },
      { id: 'verdana', label: 'Verdana', stack: 'Verdana, "DejaVu Sans", sans-serif' },
      { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
      { id: 'trebuchet', label: 'Trebuchet MS', stack: '"Trebuchet MS", "Lucida Grande", sans-serif' },
    ],
  },
  {
    label: 'Serif',
    fonts: [
      { id: 'serif', label: 'Serif (default)', stack: 'Georgia, "Times New Roman", serif' },
      { id: 'times', label: 'Times New Roman', stack: '"Times New Roman", Times, "Liberation Serif", serif' },
      { id: 'georgia', label: 'Georgia', stack: 'Georgia, "DejaVu Serif", serif' },
      { id: 'palatino', label: 'Palatino', stack: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
      { id: 'garamond', label: 'Garamond', stack: 'Garamond, "EB Garamond", "Times New Roman", serif' },
    ],
  },
  {
    label: 'Monospace',
    fonts: [
      { id: 'mono', label: 'Monospace (default)', stack: 'Menlo, Consolas, "DejaVu Sans Mono", monospace' },
      { id: 'courier', label: 'Courier New', stack: '"Courier New", Courier, "Liberation Mono", monospace' },
      { id: 'consolas', label: 'Consolas', stack: 'Consolas, Menlo, "DejaVu Sans Mono", monospace' },
    ],
  },
];

export const FONT_STACKS: Record<string, string> = Object.fromEntries(
  FONT_GROUPS.flatMap((g) => g.fonts.map((f) => [f.id, f.stack])),
);

/** CSS font-family for a font key, or for the name of any installed font. */
export function fontStack(family: string): string {
  return FONT_STACKS[family] ?? `"${family.replace(/["\\;<>{}]/g, '')}", sans-serif`;
}

/** Display settings of a new plot. */
export const DEFAULT_STYLE: PlotStyle = {
  colormap: 'viridis',
  pointPx: 3,
  smoothSigmaBins: 2,
  contour: { mode: 'equal-prob', pct: 5 },
  showOutliers: true,
  histBins: 256,
  histNorm: 'mode',
  histSmooth: false,
};

/** Figure options of a plot that has none saved; the plot box is square. */
export const DEFAULT_FIGURE: PlotFigure = PlotFigureSchema.parse({ boxAspect: 1 });

/** Figure options of a new Tiles plot: an 11 px base font, the other sizes scaled with it. */
export const TILE_FIGURE: PlotFigure = PlotFigureSchema.parse({
  fontSize: 11,
  titleFontSize: 14,
  tickFontSize: 11,
  axisTitleFontSize: 12,
  gateFontSize: 11.5,
  boxAspect: 1,
});

/** Settings of a new Tiles plot; its figure options are always saved, so resets keep the Tiles sizes. */
export const TILE_STYLE: PlotStyle = { ...DEFAULT_STYLE, figure: TILE_FIGURE };

/**
 * `plot` drawn with a `px` base font: its other text sizes keep their ratio to the base (as when the base
 * is edited); one without saved figure options is drawn with the Tiles defaults.
 */
export function withBaseFont(plot: PlotSpec, px: number): PlotSpec {
  const f = plot.style.figure;
  if (!f) return { ...plot, style: { ...plot.style, figure: TILE_FIGURE } };
  const k = px / f.fontSize;
  const figure: PlotFigure = {
    ...f,
    fontSize: px,
    titleFontSize: f.titleFontSize * k,
    tickFontSize: f.tickFontSize * k,
    axisTitleFontSize: f.axisTitleFontSize * k,
    gateFontSize: f.gateFontSize * k,
  };
  return { ...plot, style: { ...plot.style, figure } };
}

/** SVG text styling for `t`, falling back to the figure's font family `base` and color `baseColor`. */
export function textCss(t: TextStyle, base: string, baseColor: string): CSSProperties {
  return {
    fontFamily: fontStack(t.fontFamily ?? base),
    fontWeight: t.bold ? 700 : 400,
    fontStyle: t.italic ? 'italic' : 'normal',
    textDecoration: t.underline ? 'underline' : 'none',
    fill: t.color ?? baseColor,
  };
}

/** SVG text styling for one kind of plot text; color falls back to the base color. */
export function figureText(fig: PlotFigure, t: TextStyle, size: number): CSSProperties {
  return { fontSize: size, ...textCss(t, fig.fontFamily, fig.fontColor) };
}

/** Figure options that stay with each population's plot when settings are carried or applied across populations. */
export const PER_PLOT = ['title', 'xTicks', 'yTicks', 'xTitle', 'yTitle'] as const;

/** `from`'s shareable settings over `to`'s per-plot ones. */
export function sharedStyle(from: PlotStyle, to: PlotStyle): PlotStyle {
  const style = jsonClone(from);
  const own = to.figure;
  if (style.figure || own) {
    const f = (style.figure ??= structuredClone(DEFAULT_FIGURE));
    for (const k of PER_PLOT) {
      if (own?.[k] === undefined) delete f[k];
      else (f as Record<string, unknown>)[k] = jsonClone(own[k]);
    }
  }
  return style;
}

/**
 * Apply plot `plotId`'s settings to every other population's plot in `plots` (a group's Gate-view, Tiles or
 * grid plots) now; each keeps its title, ticks and axis titles.
 */
export function applyToPopulations(plots: PlotSpec[], plotId: string) {
  applyShared(PLOT_SCOPES, sharePlot, plots, plotId);
}

/** Whether every other population's plot in `plots` already has plot `plotId`'s settings. */
export function populationsMatch(plots: PlotSpec[], plotId: string): boolean {
  return sharedMatch(PLOT_SCOPES, sharePlot, plots, plotId);
}

/**
 * Opening population plot `to` after `from` while settings are carried across populations: `to` takes
 * `from`'s settings, keeping its own title, ticks and axis titles. Returns whether anything changed.
 */
export function carryToPopulation(from: PlotSpec, to: PlotSpec): boolean {
  return carryShared(PLOT_SCOPES, sharePlot, from, to);
}

/** A plot whose channels can change; only a saved plot (with `style`) keeps settings per channel pair. */
type Restylable = { kind: string; x: { channel: string }; y?: { channel: string }; style?: PlotStyle } & {
  styleFollow?: boolean;
  stylesByAxes?: Record<string, PlotStyle>;
  styleBase?: PlotStyle;
};

export const axesKey = (p: Restylable) =>
  `${p.x.channel}|${p.kind === 'histogram' ? '' : (p.y?.channel ?? '')}`;

/** A plot's settings are kept per channel pair (lib/styleScope.ts). */
const PLOT_SCOPES: StyleScopes<Restylable, PlotStyle> = {
  scope: axesKey,
  get: (p) => p.style,
  set: (p, s) => void (p.style = jsonClone(s)),
  saved: (p) => p.stylesByAxes,
  setSaved: (p, saved) => void (p.stylesByAxes = saved),
};

const sharePlot = (from: Restylable, to: Restylable): PlotStyle => sharedStyle(from.style!, to.style!);

/**
 * Run `fn`, which changes `p`'s channels. The settings in use are saved under the old channel pair. While
 * settings are carried to plots (`styleFollow` not false) the new pair takes them over; otherwise it gets
 * back its saved settings (for a pair not used before, those last applied to every pair, else the defaults).
 * Returns whether `p`'s settings were replaced.
 */
export function withAxesChange(p: Restylable, fn: () => void): boolean {
  return withScopeChange(PLOT_SCOPES, p, DEFAULT_STYLE, fn);
}

/** Apply `p`'s current settings to every channel pair of its population now, including pairs not used yet. */
export function applyToPairs(p: PlotSpec) {
  applyToScopes(PLOT_SCOPES, p);
}

/** Whether every channel pair of `p`'s population already has its current settings. */
export function pairsMatch(p: PlotSpec): boolean {
  return scopesMatch(PLOT_SCOPES, p, (s) => isDefaultStyle(s, DEFAULT_STYLE));
}

/** Default settings for `p` with every channel pair's saved settings dropped. */
export function resetPlotStyles(p: PlotSpec, defaults: PlotStyle) {
  resetAllScopes(PLOT_SCOPES, p, defaults);
}

/**
 * Carry the settings in use to the channel pairs opened next (on), or let each pair keep its own (off).
 * Nothing is applied when it is switched.
 */
export function setPairStyles(p: PlotSpec, perPair: boolean) {
  setPerScope(p, perPair);
}

/** Default settings for `p`'s current channel pair only. */
export function resetCurrentStyle(p: PlotSpec, defaults: PlotStyle) {
  resetCurrentScope(PLOT_SCOPES, p, defaults);
}

/** The settings each tab of the Gate view's settings panel holds. */
export const PANEL_FIGURE_KEYS: Record<'figure' | 'axis' | 'text', (keyof PlotFigure)[]> = {
  figure: [
    'title',
    'fontFamily',
    'fontColor',
    'fontSize',
    'titleFontSize',
    'tickFontSize',
    'axisTitleFontSize',
    'gateFontSize',
    'showOffScaleNote',
  ],
  axis: [
    'axisColor',
    'tickWidth',
    'spineColor',
    'spineWidth',
    'boxAspect',
    'showTickLabels',
    'xTicks',
    'yTicks',
    'xTitle',
    'yTitle',
  ],
  text: [
    'titleText',
    'titleFontSize',
    'tickText',
    'tickFontSize',
    'axisTitleText',
    'axisTitleFontSize',
    'gateText',
    'gateFontSize',
  ],
};

/** Reset the figure options `keys` of `style` (and, with `display`, its display settings) to the defaults `base`. */
export function resetStyleKeys(
  style: PlotStyle,
  keys: (keyof PlotFigure)[],
  display: PlotStyle | null,
  base: PlotFigure = DEFAULT_FIGURE,
) {
  if (display) {
    const { figure } = style;
    Object.assign(style, structuredClone(display));
    style.figure = figure;
  }
  if (!style.figure) return;
  for (const k of keys) {
    const d = base[k];
    if (d === undefined) delete style.figure[k];
    else (style.figure as Record<string, unknown>)[k] = structuredClone(d);
  }
}

/** Whether the figure options `keys` of `style` (and, with `display`, its display settings) are at the defaults `base`. */
export function styleKeysAtDefaults(
  style: PlotStyle,
  keys: (keyof PlotFigure)[],
  display: PlotStyle | null,
  base: PlotFigure = DEFAULT_FIGURE,
) {
  const f = style.figure ?? base;
  if (keys.some((k) => sortedJson(f[k]) !== sortedJson(base[k]))) return false;
  if (!display) return true;
  const { figure: _a, ...rest } = style;
  const { figure: _b, ...shown } = display;
  return sortedJson(rest) === sortedJson(shown);
}

/** Default settings for channel pair `key` in every plot of `plots`, current or saved. */
export function resetPairStyles(plots: PlotSpec[], key: string, defaults: PlotStyle) {
  resetScopeEverywhere(PLOT_SCOPES, plots, key, defaults);
}

/** Whether `s` equals `defaults`, counting figure options left at their defaults as unset. */
export function isDefaultStyle(s: PlotStyle, defaults: PlotStyle): boolean {
  const { figure, ...rest } = s;
  const { figure: baseFigure, ...base } = defaults;
  return (
    sortedJson(rest) === sortedJson(base) &&
    (!figure || sortedJson(figure) === sortedJson(baseFigure ?? DEFAULT_FIGURE))
  );
}

/** Whether `p` is at the defaults for its current, every saved and every unused channel pair. */
export const plotAtDefaults = (p: PlotSpec, defaults: PlotStyle) =>
  scopesAtDefaults(PLOT_SCOPES, p, (s) => isDefaultStyle(s, defaults));

/** Whether channel pair `key` is at the defaults in every plot of `plots`. */
export const pairAtDefaults = (plots: PlotSpec[], key: string, defaults: PlotStyle) =>
  scopeAtDefaults(PLOT_SCOPES, plots, key, (s) => isDefaultStyle(s, defaults));
