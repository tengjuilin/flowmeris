import {
  type Group,
  type PlotFigure,
  PlotFigureSchema,
  type PlotSpec,
  type PlotStyle,
  type TextStyle,
} from '@flowmeris/model';
import type { CSSProperties } from 'react';

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

/** Figure options of a plot that has none saved. */
export const DEFAULT_FIGURE: PlotFigure = PlotFigureSchema.parse({});

/** SVG text styling for one kind of plot text; color falls back to the base color. */
export function figureText(fig: PlotFigure, t: TextStyle, size: number): CSSProperties {
  return {
    fontSize: size,
    fontFamily: fontStack(t.fontFamily ?? fig.fontFamily),
    fontWeight: t.bold ? 700 : 400,
    fontStyle: t.italic ? 'italic' : 'normal',
    textDecoration: t.underline ? 'underline' : 'none',
    fill: t.color ?? fig.fontColor,
  };
}

/** Figure options that stay with each plot when the group's plots share their settings. */
const PER_PLOT = ['title', 'xTicks', 'yTicks', 'xTitle', 'yTitle'] as const;

/** `from`'s shareable settings over `to`'s per-plot ones. */
function sharedStyle(from: PlotStyle, to: PlotStyle): PlotStyle {
  const style = JSON.parse(JSON.stringify(from)) as PlotStyle;
  const own = to.figure;
  if (style.figure || own) {
    const f = (style.figure ??= structuredClone(DEFAULT_FIGURE));
    for (const k of PER_PLOT) {
      if (own?.[k] === undefined) delete f[k];
      else (f as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(own[k]));
    }
  }
  return style;
}

/** While the group's plots share their settings, copy plot `plotId`'s settings to the others. */
export function syncPlotStyles(g: Group, plotId: string) {
  if (!g.plotStyleFollow) return;
  const src = g.plots.find((p) => p.id === plotId);
  if (!src) return;
  const from = src.style;
  for (const p of g.plots) if (p.id !== plotId) p.style = sharedStyle(from, p.style);
}

/** Settings for a new plot in `g`: those its plots share, when they do. */
export function newPlotStyle(g: Group, fallback: PlotStyle): PlotStyle {
  const src = g.plotStyleFollow ? g.plots[0] : undefined;
  return src ? sharedStyle(src.style, fallback) : { ...fallback };
}

/** A plot whose channels can change; only a saved plot (with `style`) keeps settings per channel pair. */
type Restylable = { kind: string; x: { channel: string }; y?: { channel: string }; style?: PlotStyle } & {
  styleFollow?: boolean;
  stylesByAxes?: Record<string, PlotStyle>;
};

export const axesKey = (p: Restylable) =>
  `${p.x.channel}|${p.kind === 'histogram' ? '' : (p.y?.channel ?? '')}`;

/**
 * Run `fn`, which changes `p`'s channels. While `p` keeps settings per channel pair, its settings are
 * saved under the old pair and the new pair's are restored. Returns whether saved settings were restored.
 */
export function withAxesChange(p: Restylable, fn: () => void): boolean {
  const before = axesKey(p);
  const style = p.style && (JSON.parse(JSON.stringify(p.style)) as PlotStyle);
  fn();
  const after = axesKey(p);
  if (!style || p.styleFollow !== false || after === before) return false;
  p.stylesByAxes ??= {};
  p.stylesByAxes[before] = style;
  const saved = p.stylesByAxes[after];
  if (!saved) return false;
  p.style = JSON.parse(JSON.stringify(saved)) as PlotStyle;
  return true;
}

/** Default settings for `p` with every channel pair's saved settings dropped. */
export function resetPlotStyles(p: PlotSpec, defaults: PlotStyle) {
  p.style = structuredClone(defaults);
  p.stylesByAxes = undefined;
}

/** Default settings for channel pair `key` in every plot of `g`, current or saved. */
export function resetPairStyles(g: Group, key: string, defaults: PlotStyle) {
  for (const p of g.plots) {
    if (axesKey(p) === key) p.style = structuredClone(defaults);
    if (p.stylesByAxes) delete p.stylesByAxes[key];
  }
}

/** JSON with object keys sorted, so equal settings compare equal whatever order they were set in. */
const canon = (v: unknown) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x,
  );

/** Whether `s` equals `defaults`, counting figure options left at their defaults as unset. */
export function isDefaultStyle(s: PlotStyle, defaults: PlotStyle): boolean {
  const { figure, ...rest } = s;
  const { figure: _, ...base } = defaults;
  return canon(rest) === canon(base) && (!figure || canon(figure) === canon(DEFAULT_FIGURE));
}

const noSaved = (p: PlotSpec, key?: string) =>
  !p.stylesByAxes || (key ? !p.stylesByAxes[key] : Object.keys(p.stylesByAxes).length === 0);

/** Whether `p` is at the defaults for its current and every saved channel pair. */
export const plotAtDefaults = (p: PlotSpec, defaults: PlotStyle) =>
  isDefaultStyle(p.style, defaults) && noSaved(p);

/** Whether channel pair `key` is at the defaults in every plot of `g`. */
export const pairAtDefaults = (g: Group, key: string, defaults: PlotStyle) =>
  g.plots.every((p) => (axesKey(p) !== key || isDefaultStyle(p.style, defaults)) && noSaved(p, key));
