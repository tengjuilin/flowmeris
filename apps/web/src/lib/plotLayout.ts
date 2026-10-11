import type { PlotSpec, Workspace } from '@flowmeris/model';
import type { PlotMargin } from './export/index.ts';
import { DEFAULT_FIGURE } from './figure.ts';

/**
 * Margins, plot area (pw × ph) and overall size of `plot` drawn in `availWidth` × `availHeight`:
 * a fixed box aspect ratio (figure `boxAspect`) may use less than the space available.
 */
export function plotBox(plot: PlotSpec, availWidth: number, availHeight: number, compact = false) {
  const fig = plot.style.figure ?? DEFAULT_FIGURE;
  // Text positions and margins follow the font sizes.
  const tickY = 7 + fig.tickFontSize;
  const xTitleY = (fig.showTickLabels ? tickY : 4) + 10 + fig.axisTitleFontSize;
  const yTitleX = -(fig.showTickLabels ? 19 + 3 * fig.tickFontSize : 14);
  const title = fig.title?.trim();
  const margin: PlotMargin = compact
    ? { l: 6, r: 4, t: 4, b: 6 }
    : {
        l: -yTitleX + fig.axisTitleFontSize + 2,
        r: 14,
        t: title ? 14 + fig.titleFontSize * 1.4 : 14,
        b: xTitleY + 8,
      };
  let pw = Math.max(10, availWidth - margin.l - margin.r);
  let ph = Math.max(10, availHeight - margin.t - margin.b);
  // A fixed box aspect ratio shrinks the plot area to the largest box of that shape that fits.
  if (fig.boxAspect) {
    if (pw / ph > fig.boxAspect) pw = Math.max(10, ph * fig.boxAspect);
    else ph = Math.max(10, pw / fig.boxAspect);
  }
  const width = fig.boxAspect ? pw + margin.l + margin.r : availWidth;
  const height = fig.boxAspect ? ph + margin.t + margin.b : availHeight;
  return { margin, pw, ph, width, height, tickY, xTitleY, yTitleX, title };
}

/**
 * An axis title: the figure's custom title, else the channel's `$PnS :: $PnN` (or `$PnN`). On a
 * histogram only the x title is customizable.
 */
export function axisLabel(ws: Workspace, sampleId: string, plot: PlotSpec, axis: 'x' | 'y'): string {
  const a = plot[axis]!;
  const fig = plot.style.figure ?? DEFAULT_FIGURE;
  const is1d = plot.kind === 'histogram' || !plot.y;
  const custom = axis === 'x' ? fig.xTitle : is1d ? undefined : fig.yTitle;
  const ch = ws.samples[sampleId]?.channels.find((c) => c.pnn === a.channel);
  return (custom ?? (ch?.pns ? `${ch.pns} :: ${a.channel}` : a.channel)).trim();
}

/** What a plot shows, for screen readers: `dot plot of CD4 :: FL1-A versus FL2-A`. */
export function plotAriaLabel(ws: Workspace, sampleId: string, plot: PlotSpec): string {
  const is1d = plot.kind === 'histogram' || !plot.y;
  const y = plot.y && !is1d ? ` versus ${axisLabel(ws, sampleId, plot, 'y')}` : '';
  return `${plot.kind} plot of ${axisLabel(ws, sampleId, plot, 'x')}${y}`;
}
