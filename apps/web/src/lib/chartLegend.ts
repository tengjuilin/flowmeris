import type { ChartStyle } from '@flowmeris/model';
import { legendSwatch, textW } from './chartLayout.ts';

/**
 * The legend of the statistics charts (Charts view): where it goes, its grid of entries (columns that wrap
 * to fit), and the space it takes from the plot area.
 */

export type LegendLoc = ChartStyle['legend'];
export type LegendAlign = ChartStyle['legendAlign'];

export const LEGEND_LOCS: { id: LegendLoc; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'inside-top-left', label: 'Inside, top left' },
  { id: 'inside-top-right', label: 'Inside, top right' },
  { id: 'inside-bottom-left', label: 'Inside, bottom left' },
  { id: 'inside-bottom-right', label: 'Inside, bottom right' },
  { id: 'none', label: 'Hidden' },
];

export const LEGEND_ALIGNS: { id: LegendAlign; label: string }[] = [
  { id: 'start', label: 'Start' },
  { id: 'center', label: 'Center' },
  { id: 'end', label: 'End' },
];

/** Space between rows and between columns of entries (px). */
export const LEGEND_ROW_GAP = 8;
export const LEGEND_COL_GAP = 16;
/** Padding between an inside legend and the plot area's edge, and inside its frame (px). */
export const LEGEND_INSET = 8;
export const LEGEND_PAD = 6;

export const legendInside = (loc: LegendLoc) => loc.startsWith('inside-');
/** Top and bottom legends run along the plot area's width; the others along its height. */
export const legendAcross = (loc: LegendLoc) => loc === 'top' || loc === 'bottom';

/** A legend's grid: its size, and each entry's top-left corner, relative to the legend's own. */
export interface LegendGrid {
  w: number;
  h: number;
  cols: number;
  rows: number;
  items: { x: number; y: number }[];
}

/**
 * The grid of legend entries `names` with text `size` px. `columns` fixes the number of columns; without
 * it a top or bottom legend takes as many as fit in `avail` px of width, and a side or inside legend as
 * many rows as fit in `avail` px of height, wrapping to more columns. Entries fill rows first across the
 * top or bottom, and columns first elsewhere.
 */
export function legendGrid(
  names: string[],
  size: number,
  loc: LegendLoc,
  columns: number | undefined,
  avail: number,
): LegendGrid {
  const n = names.length;
  if (!n) return { w: 0, h: 0, cols: 0, rows: 0, items: [] };
  const across = legendAcross(loc);
  const entryW = names.map((s) => legendSwatch(size) + 5 + textW(s, size));
  const layout = (cols: number): LegendGrid => {
    const rows = Math.ceil(n / cols);
    const cell = (i: number) =>
      across ? { r: Math.floor(i / cols), c: i % cols } : { r: i % rows, c: Math.floor(i / rows) };
    // Filling columns first, the rows asked for can leave the last columns empty.
    const used = across ? cols : Math.ceil(n / rows);
    const colW = Array.from({ length: used }, () => 0);
    names.forEach((_, i) => {
      const { c } = cell(i);
      colW[c] = Math.max(colW[c]!, entryW[i]!);
    });
    const colX = colW.map((_, c) => colW.slice(0, c).reduce((a, b) => a + b + LEGEND_COL_GAP, 0));
    return {
      w: colW.reduce((a, b) => a + b, 0) + (used - 1) * LEGEND_COL_GAP,
      h: rows * size + (rows - 1) * LEGEND_ROW_GAP,
      cols: used,
      rows,
      items: names.map((_, i) => {
        const { r, c } = cell(i);
        return { x: colX[c]!, y: r * (size + LEGEND_ROW_GAP) };
      }),
    };
  };
  if (columns !== undefined) return layout(Math.max(1, Math.min(n, Math.round(columns))));
  if (across) {
    // The most columns that fit; one when even that is too wide.
    for (let cols = n; cols > 1; cols--) {
      const g = layout(cols);
      if (g.w <= avail) return g;
    }
    return layout(1);
  }
  const rowsFit = Math.max(1, Math.floor((avail + LEGEND_ROW_GAP) / (size + LEGEND_ROW_GAP)));
  return layout(Math.ceil(n / rowsFit));
}

/** Room an outside legend takes from the margins (px); none inside the plot area or hidden. */
export function legendMargins(loc: LegendLoc, g: Pick<LegendGrid, 'w' | 'h'>) {
  const room = { t: 0, r: 0, b: 0, l: 0 };
  if (!g.w) return room;
  if (loc === 'top') room.t = g.h + 14;
  else if (loc === 'bottom') room.b = g.h + 10;
  else if (loc === 'left') room.l = g.w + 16;
  else if (loc === 'right') room.r = g.w + 16;
  return room;
}

/**
 * The legend's top-left corner in a chart `W` × `H` px whose plot area is `pw` × `ph` at (l, t):
 * above, below, left or right of the plot area, aligned along it by `align`, or in a corner inside it.
 */
export function legendOrigin(
  loc: LegendLoc,
  align: LegendAlign,
  g: Pick<LegendGrid, 'w' | 'h'>,
  a: { l: number; t: number; pw: number; ph: number; H: number },
) {
  const along = (start: number, length: number, size: number) =>
    align === 'center' ? start + (length - size) / 2 : align === 'end' ? start + length - size : start;
  const keep = (v: number) => Math.max(4, v);
  if (loc === 'top') return { x: keep(along(a.l, a.pw, g.w)), y: 8 };
  if (loc === 'bottom') return { x: keep(along(a.l, a.pw, g.w)), y: a.H - g.h - 6 };
  if (loc === 'left') return { x: 6, y: keep(along(a.t, a.ph, g.h)) };
  if (loc === 'right') return { x: a.l + a.pw + 16, y: keep(along(a.t, a.ph, g.h)) };
  const left = loc.endsWith('left');
  const top = loc.startsWith('inside-top');
  return {
    x: left ? a.l + LEGEND_INSET + LEGEND_PAD : a.l + a.pw - LEGEND_INSET - LEGEND_PAD - g.w,
    y: top ? a.t + LEGEND_INSET + LEGEND_PAD : a.t + a.ph - LEGEND_INSET - LEGEND_PAD - g.h,
  };
}
