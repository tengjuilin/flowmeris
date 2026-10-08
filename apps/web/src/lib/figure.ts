import {
  type Group,
  type PlotFigure,
  PlotFigureSchema,
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
