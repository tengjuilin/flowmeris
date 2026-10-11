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
  /** Per-series colors, overriding `colorMode`. */
  seriesColors: z.record(HexColor).default({}),
  /** Per-series legend text, overriding the value. */
  seriesLabels: z.record(z.string()).default({}),
  /** Display order of series; series not listed follow in the variable's category order. */
  seriesOrder: z.array(z.string()).default([]),
  /** Mean marker shape (scatter, line, dot); 'hline' is a horizontal line across the mean. */
  markerShape: z.enum(['circle', 'square', 'triangle', 'diamond', 'hline']).default('circle'),
  /** Mean marker radius in px (scatter, line, dot); other shapes have the same area as that circle. */
  markerSize: Num.min(0).max(30).default(5),
  /** Mean marker fill; omitted = the series color. */
  markerColor: HexColor.optional(),
  /** Mean marker edge: color (omitted = the background) and width in px (omitted = half the size, at most 2). */
  markerEdgeColor: HexColor.optional(),
  markerEdgeWidth: Num.min(0).max(10).optional(),
  /** The 'hline' marker: its width and length in px (length omitted = the series' slot, 16 px off a band axis) and color (omitted = the series color). */
  meanLineWidth: Num.min(0).max(20).default(2),
  meanLineLength: Num.min(0).max(200).optional(),
  meanLineColor: HexColor.optional(),
  /** The line joining a line chart's means: width in px, color (omitted = the series color) and dash. */
  lineWidth: Num.min(0).max(20).default(2),
  lineColor: HexColor.optional(),
  lineDash: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
  /** Bar width as a fraction of the category width; omitted = automatic (at most 24 px per series). */
  barWidth: Num.min(0.05).max(1).optional(),
  /** Bar outline: color (omitted = the series color) and width in px (0 = none). */
  barEdgeColor: HexColor.optional(),
  barEdgeWidth: Num.min(0).max(10).default(0),
  /** Opacity of bars and mean markers. */
  fillOpacity: Num.min(0).max(1).default(1),
  errorWidth: Num.min(0).max(10).default(1.5),
  /** Error bar color; omitted = the theme's. */
  errorColor: HexColor.optional(),
  /** Error-bar cap width in px; omitted = automatic. */
  capWidth: Num.min(0).max(60).optional(),
  /** Replicate point shape, and radius in px (other shapes have the same area as that circle). */
  pointShape: z.enum(['circle', 'square', 'triangle', 'diamond']).default('circle'),
  pointSize: Num.min(0).max(20).default(3),
  /** Replicate point fill (omitted = the series color; bar charts: the background) and edge color (omitted = the background; bar charts: the text color) and width in px (omitted = 1.5; bar charts: 1). */
  pointColor: HexColor.optional(),
  pointEdgeColor: HexColor.optional(),
  pointEdgeWidth: Num.min(0).max(10).optional(),
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
  /** Gridline color (omitted = the theme's) and width in px. */
  gridColor: HexColor.optional(),
  gridWidth: Num.min(0).max(10).default(1),
  /** Tick marks and the axis lines (spines): colors (omitted = the theme's) and widths in px. */
  tickColor: HexColor.optional(),
  tickWidth: Num.min(0).max(10).default(1),
  spineColor: HexColor.optional(),
  spineWidth: Num.min(0).max(10).default(1),
  /** Plot area width ÷ height, fitted inside the chart's size; omitted = the plot area fills it. */
  boxAspect: Num.min(0.2).max(10).optional(),
  showTickLabels: z.boolean().default(true),
  /** A key of the app's font list (earlier charts used only 'sans', 'serif' and 'mono'), or any installed font. */
  fontFamily: z.string().min(1).max(80).default('sans'),
  /** Omitted = the app theme's text colors. */
  fontColor: HexColor.optional(),
  /** Base font size (px); editing it rescales the tick, axis title and legend sizes by the same ratio. */
  fontSize: Num.min(4).max(48).default(12),
  tickFontSize: Num.min(4).max(48).default(11),
  tickText: TextStyleSchema.default({}),
  titleFontSize: Num.min(4).max(48).default(12),
  titleText: TextStyleSchema.default({ bold: true }),
  /** Legend location: outside the plot area on a side, in a corner inside it, or hidden. */
  legend: z
    .enum([
      'top',
      'bottom',
      'left',
      'right',
      'inside-top-left',
      'inside-top-right',
      'inside-bottom-left',
      'inside-bottom-right',
      'none',
    ])
    .default('top'),
  /** Alignment of an outside legend along the plot area's side. */
  legendAlign: z.enum(['start', 'center', 'end']).default('start'),
  /** Columns of legend entries; omitted = automatic (as many as fit, wrapping to fit). */
  legendColumns: z.number().int().min(1).max(50).optional(),
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
  /** Categorical variable id: one color per value. */
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
