import type { AxisSpec } from '@flowmeris/model';
import { histogram, raster2d } from '@flowmeris/render';
import type { Columns } from '../columns.ts';
import type { Populations } from '../populations.ts';
import type {
  AnalysisContext,
  HistogramResponse,
  RasterRequest,
  RasterResponse,
  SampleData,
} from '../types.ts';

export type HistogramStyle = Parameters<typeof histogram>[3];

const axisColumn = (columns: Columns, ctx: AnalysisContext, s: SampleData, a: AxisSpec): Float64Array =>
  columns.column(ctx, s, { channel: a.channel, comp: a.comp, transform: a.transform });

/** A 2D plot of one sample, whose columns are loaded. */
export function rasterOf(
  columns: Columns,
  pops: Populations,
  ctx: AnalysisContext,
  s: SampleData,
  req: RasterRequest,
): RasterResponse {
  const plot = req.plot;
  if (plot.kind === 'histogram' || !plot.y) throw new Error('raster() needs a 2D plot');
  const idx = pops.indices(ctx, s, plot.population);
  const r = raster2d({
    kind: plot.kind,
    width: req.width,
    height: req.height,
    x: axisColumn(columns, ctx, s, plot.x),
    y: axisColumn(columns, ctx, s, plot.y),
    indices: idx,
    xRange: plot.x.range,
    yRange: plot.y.range,
    style: plot.style,
    dotColor: req.dotColor,
  });
  return {
    width: r.width,
    height: r.height,
    rgba: r.rgba,
    contours: r.contours,
    eventsPlotted: idx ? idx.length : s.eventCount,
    offScale: r.stats.offScale,
    nan: r.stats.nan,
    sigmaPx: r.sigmaPx,
  };
}

/** A histogram of one population on one axis, for a sample whose columns are loaded. */
export function histogramOf(
  columns: Columns,
  pops: Populations,
  ctx: AnalysisContext,
  s: SampleData,
  popId: string,
  axis: AxisSpec,
  style: HistogramStyle,
): HistogramResponse {
  const idx = pops.indices(ctx, s, popId);
  const h = histogram(axisColumn(columns, ctx, s, axis), idx, axis.range, style);
  return {
    centers: h.centers,
    heights: h.heights,
    eventsPlotted: idx ? idx.length : s.eventCount,
    offScale: h.stats.offScale,
    nan: h.stats.nan,
  };
}
