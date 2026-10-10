import type { RidgeCurve } from '@flowmeris/density';
import type { RidgeStyle } from '@flowmeris/model';
import type { RidgeRow } from './ridgeRows.ts';
import { wrapText } from './text.ts';

/** Label text of one ridge: its name and, on a line of its own if set so, its event count. */
export interface RidgeLabel {
  name: string;
  count: string;
}

/**
 * Label text per ridge: the name (custom or default) plus the event count, `(3×, n=1,234)` for combined
 * replicates, `(missing)` when none of its files is loaded, nothing while it loads.
 */
export function ridgeLabels(
  rows: RidgeRow[],
  curves: Record<string, RidgeCurve | null>,
  missing: Record<string, unknown>,
  style: RidgeStyle,
  combined: boolean,
): RidgeLabel[] {
  return rows.map((r) => {
    const h = curves[r.id];
    const none = r.sampleIds.every((id) => missing[id]);
    const reps = r.sampleIds.length > 1 || combined ? `${r.sampleIds.length}×, ` : '';
    const count = !style.showCounts
      ? ''
      : h
        ? ` (${reps}n=${h.events.toLocaleString()})`
        : none
          ? ' (missing)'
          : '';
    const split = style.countOnNewLine && count !== '';
    const name = style.sampleLabels[r.id] ?? r.label;
    return { name: split ? name : name + count, count: split ? count.trim() : '' };
  });
}

/** Pixel layout of a ridge plot: the label column, rows, axis and overall size. */
export interface RidgeFrame {
  /** Label column width, and each ridge's label lines and their line height. */
  labelW: number;
  labelLines: string[][];
  lineH: number;
  /** Figure size, and the plot area's width right of the label column. */
  W: number;
  H: number;
  pw: number;
  /** Row pitch, a ridge's full height (a mode-normalised curve reaches 1), and the baseline of the first. */
  rowH: number;
  amp: number;
  top: number;
  /** The x axis line, and the tick labels and title below it (relative to `axisY`). */
  axisY: number;
  tickLabelY: number;
  titleY: number;
}

/**
 * Lay out a ridge plot of `labels.length` ridges (at least one row) in a view `viewWidth` wide, with
 * `measure` giving label widths and an x axis `title` (empty for none).
 */
export function ridgeFrame(
  style: RidgeStyle,
  overlap: number,
  labels: RidgeLabel[],
  measure: (s: string) => number,
  viewWidth: number,
  title: string,
): RidgeFrame {
  const n = Math.max(1, labels.length);
  const labelW = !style.showLabels
    ? 20
    : style.labelOverflow === 'widen'
      ? Math.ceil(Math.max(0, ...labels.flatMap((t) => [measure(t.name), measure(t.count)]))) + 16
      : style.labelWidth;
  const labelLines = labels.map((t) =>
    !style.showLabels
      ? []
      : style.labelOverflow === 'widen'
        ? [t.name, t.count].filter(Boolean)
        : [
            ...wrapText(t.name, labelW - 16, measure),
            ...(t.count ? wrapText(t.count, labelW - 16, measure) : []),
          ],
  );
  const lineH = style.labelFontSize * 1.15;
  // Room above the first ridge for a label that runs up from its baseline.
  const topPad = Math.max(0, (labelLines[0]?.length ?? 0) * lineH - 23);
  const W = style.width ?? Math.max(400, viewWidth - 24);
  const pw = Math.max(50, W - labelW - 20);
  const tickLabelY = style.tickFontSize + 7;
  const titleY = (style.showTickLabels ? tickLabelY : 6) + style.titleFontSize + 2;
  const belowAxis = (title ? titleY : style.showTickLabels ? tickLabelY : 6) + 6;
  // With a fixed aspect ratio the figure height is set and the row pitch is derived to fill it.
  const rowH = style.aspect
    ? Math.max(4, (W / style.aspect - 26 - topPad - belowAxis) / (n - 1 + 1 / (1 - overlap)))
    : (style.rowHeight ?? Math.max(18, Math.min(60, 600 / n)));
  const amp = rowH / (1 - overlap);
  const top = 20 + topPad + amp;
  const axisY = 20 + topPad + rowH * (n - 1) + amp + 6;
  return {
    labelW,
    labelLines,
    lineH,
    W,
    H: axisY + belowAxis,
    pw,
    rowH,
    amp,
    top,
    axisY,
    tickLabelY,
    titleY,
  };
}

/**
 * SVG paths of one ridge on baseline `base`: its filled curve, and its spread band (empty without one).
 * `X` maps a bin centre to pixels; heights are scaled by `amp`.
 */
export function ridgePaths(
  h: RidgeCurve,
  X: (v: number) => number,
  base: number,
  amp: number,
): { curve: string; band: string } {
  const Y = (v: number) => base - v * amp;
  const last = h.centers.length - 1;
  let curve = `M${X(h.centers[0]!)},${base}`;
  for (let k = 0; k <= last; k++) curve += `L${X(h.centers[k]!)},${Y(h.heights[k]!)}`;
  curve += `L${X(h.centers[last]!)},${base}Z`;
  let band = '';
  if (h.band) {
    band = `M${X(h.centers[0]!)},${Y(h.band.hi[0]!)}`;
    for (let k = 1; k <= last; k++) band += `L${X(h.centers[k]!)},${Y(h.band.hi[k]!)}`;
    for (let k = last; k >= 0; k--) band += `L${X(h.centers[k]!)},${Y(h.band.lo[k]!)}`;
    band += 'Z';
  }
  return { curve, band };
}
