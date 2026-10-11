import type { Cell, PlotSeries, Row } from '@flowmeris/table';

/** Key of a chart point (the rows sharing a series and x value) in `StatPlot.hiddenPoints`. */
export const pointKey = (series: Cell, x: Cell) => JSON.stringify([series ?? null, x ?? null]);

/** The rows a chart summarizes: those not excluded. */
export function includedRows(rows: Row[], exclude: string[]): Row[] {
  if (!exclude.length) return rows;
  const out = new Set(exclude);
  return rows.filter((r) => !out.has(r.id));
}

/** The plotted series: hidden points dropped, and series left without points dropped. */
export function visiblePoints(series: PlotSeries[], hidden: string[]): PlotSeries[] {
  if (!hidden.length) return series;
  const off = new Set(hidden);
  return series.flatMap((s) => {
    const points = s.points.filter((p) => !off.has(pointKey(s.key, p.x)));
    return points.length ? [{ ...s, points }] : [];
  });
}
