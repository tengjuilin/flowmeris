import type { ChartStyle } from '@flowmeris/model';

/** Layout of the statistics charts (Charts view): margins and the slots of series within a category. */

/** Rough width of text in px (no layout pass needed). */
export const textW = (s: string, size: number) => s.length * size * 0.6;

/** Side of a legend swatch for legend text `size` px. */
export const legendSwatch = (size: number) => Math.round(size * 0.85);

/** Margins around the plot area, from the text they hold (px); the legend's room is added to them (`legendMargins`). */
export function chartMargins(st: ChartStyle, o: { xTitle: boolean; yTitle: boolean; yLabelW: number }) {
  const ts = st.titleFontSize;
  return {
    l: 14 + (o.yTitle ? ts + 8 : 0) + o.yLabelW + 8,
    r: 20,
    t: 14,
    b: (st.showTickLabels ? st.tickFontSize + 10 : 6) + (o.xTitle ? ts + 18 : 6),
  };
}

/**
 * Where `n` series sit in a category `bandW` px wide: each gets a slot (a bar, or the spread of its
 * replicates) `slot` px wide, `gap` px apart, the group `groupW` px wide in all. Without a set
 * `barWidth` (a fraction of the category) slots are at most 24 px.
 */
export function bandSlots(bandW: number, n: number, barWidth: number | undefined, bar: boolean) {
  const gap = bar ? 2 : 4;
  const slot =
    barWidth === undefined
      ? Math.min(24, (bandW * 0.8) / n)
      : Math.max(1, (bandW * barWidth - (n - 1) * gap) / n);
  return { slot, gap, groupW: n * slot + (n - 1) * gap };
}

/**
 * The plot area inside a chart `width` × `height` px with margins `m`: what the margins leave, at least
 * 80 × 40 px; with `aspect` (width ÷ height) the largest such box that fits. `W` and `H` are the chart's
 * size around it, smaller than asked when the aspect leaves space over, and at least `min` (what the
 * legend needs) so nothing is cut off.
 */
export function plotArea(
  width: number,
  height: number,
  m: { l: number; r: number; t: number; b: number },
  aspect: number | undefined,
  min: { W: number; H: number } = { W: 0, H: 0 },
) {
  let pw = Math.max(80, width - m.l - m.r);
  let ph = Math.max(40, height - m.t - m.b);
  if (aspect) {
    if (pw / ph > aspect) pw = ph * aspect;
    else ph = pw / aspect;
  }
  return {
    pw,
    ph,
    W: Math.max(min.W, aspect ? pw + m.l + m.r : width),
    H: Math.max(min.H, aspect ? ph + m.t + m.b : height),
  };
}
