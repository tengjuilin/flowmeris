import { z } from 'zod';
import { HexColor, Id, Num } from './common.ts';
import { TextStyleSchema } from './figure.ts';

/** A chart of the statistics table (Charts view). */
const TickListSchema = z.array(z.object({ value: Num, label: z.string().optional() }));

/**
 * Appearance of a statistics chart. Every member has a default, so `ChartStyleSchema.parse({})` is the
 * default style. Series are keyed by the JSON of their value (`"\"ctrl\""`, `"5"`, `"null"`).
 */
export const ChartStyleSchema = z.object({
  /** 'palette': series cycle the categorical palette; 'single': every series uses `color`. */
  colorMode: z.enum(['palette', 'single']).default('palette'),
  color: HexColor.default('#2a78d6'),
  /** Per-series colours, overriding `colorMode`. */
  seriesColors: z.record(HexColor).default({}),
  /** Per-series legend text, overriding the value. */
  seriesLabels: z.record(z.string()).default({}),
  /** Display order of series; series not listed follow in the variable's category order. */
  seriesOrder: z.array(z.string()).default([]),
  /** Mean marker radius in px (scatter, line, dot). */
  markerSize: Num.min(0).max(30).default(5),
  lineWidth: Num.min(0).max(20).default(2),
  /** Bar width as a fraction of the category width; omitted = automatic (at most 24 px per series). */
  barWidth: Num.min(0.05).max(1).optional(),
  /** Opacity of bars and mean markers. */
  fillOpacity: Num.min(0).max(1).default(1),
  errorWidth: Num.min(0).max(10).default(1.5),
  /** Error-bar cap width in px; omitted = automatic. */
  capWidth: Num.min(0).max(60).optional(),
  /** Replicate point radius in px. */
  pointSize: Num.min(0).max(20).default(3),
  /** Replicate point opacity; omitted = automatic (by chart type). */
  pointOpacity: Num.min(0).max(1).optional(),
  /** Axis ranges in data units; omitted = fit the data. */
  xMin: Num.optional(),
  xMax: Num.optional(),
  yMin: Num.optional(),
  yMax: Num.optional(),
  /** Tick marks in data units; omitted = automatic. A missing label is formatted from the value. */
  xTicks: TickListSchema.optional(),
  yTicks: TickListSchema.optional(),
  showGrid: z.boolean().default(true),
  showTickLabels: z.boolean().default(true),
  /** A key of the app's font list (earlier charts used only 'sans', 'serif' and 'mono'), or any installed font. */
  fontFamily: z.string().min(1).max(80).default('sans'),
  /** Omitted = the app theme's text colours. */
  fontColor: HexColor.optional(),
  /** Base font size (px); editing it rescales the tick, axis title and legend sizes by the same ratio. */
  fontSize: Num.min(4).max(48).default(12),
  tickFontSize: Num.min(4).max(48).default(11),
  tickText: TextStyleSchema.default({}),
  titleFontSize: Num.min(4).max(48).default(12),
  titleText: TextStyleSchema.default({ bold: true }),
  legend: z.enum(['top', 'right', 'none']).default('top'),
  legendFontSize: Num.min(4).max(48).default(12),
  legendText: TextStyleSchema.default({}),
  /** Chart width in px; omitted = fit the view. */
  width: Num.min(240).max(10000).optional(),
  height: Num.min(160).max(10000).default(440),
});
export type ChartStyle = z.infer<typeof ChartStyleSchema>;

export const StatPlotSchema = z.object({
  id: Id,
  name: z.string(),
  kind: z.enum(['scatter', 'line', 'bar', 'dot']),
  x: z.string(),
  y: z.string(),
  /** Categorical variable id: one colour per value. */
  series: Id.optional(),
  xScale: z.enum(['linear', 'log10']).default('linear'),
  yScale: z.enum(['linear', 'log10']).default('linear'),
  /** Error bars over the rows sharing x (and series). */
  error: z.enum(['none', 'sd', 'sem', 'ci95']).default('sem'),
  /** Overlay the individual rows (replicates). */
  showPoints: z.boolean().default(true),
  /** Points (groups of rows) left out of the chart, keyed by `pointKey`: the JSON of [series value, x value]. */
  hiddenPoints: z.array(z.string()).default([]),
  /** Rows (sample ids) left out of the means, error bars and replicate points. */
  excludeRows: z.array(Id).default([]),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  style: ChartStyleSchema.default({}),
});
export type StatPlot = z.infer<typeof StatPlotSchema>;
