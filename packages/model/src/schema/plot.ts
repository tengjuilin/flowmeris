import { z } from 'zod';
import { Id, Num } from './common.ts';
import { CompRefSchema } from './compensation.ts';
import { PlotFigureSchema } from './figure.ts';

// ---------------------------------------------------------------------------
// Plots: axes, display settings, the Plot view
// ---------------------------------------------------------------------------

export const AxisSpecSchema = z.object({
  channel: z.string(),
  comp: CompRefSchema,
  transform: z.string(),
  /** Display range in transformed units. */
  range: z.tuple([Num, Num]),
});
export type AxisSpec = z.infer<typeof AxisSpecSchema>;

export const PlotKindSchema = z.enum(['dot', 'pseudocolor', 'density', 'contour', 'histogram']);
export type PlotKind = z.infer<typeof PlotKindSchema>;

export const ContourSpecSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('equal-prob'), pct: z.union([z.literal(2), z.literal(5), z.literal(10)]) }),
  z.object({ mode: z.literal('log'), levels: z.number().int().min(1).max(20) }),
]);
export type ContourSpec = z.infer<typeof ContourSpecSchema>;

export const PlotStyleSchema = z.object({
  colormap: z.string(),
  /** Point size in display px; fractional sizes are drawn with partly covered edge pixels. */
  pointPx: Num.min(0.25).max(10),
  /** Gaussian smoothing σ in display bins (0 = none). */
  smoothSigmaBins: Num.nonnegative(),
  contour: ContourSpecSchema,
  showOutliers: z.boolean(),
  histBins: z.number().int().min(16).max(1024),
  histNorm: z.enum(['count', 'mode', 'area']),
  histSmooth: z.boolean(),
  /** Figure options (Gate view); omitted = the defaults. */
  figure: PlotFigureSchema.optional(),
});
export type PlotStyle = z.infer<typeof PlotStyleSchema>;

export const PlotSpecSchema = z.object({
  id: Id,
  population: Id,
  kind: PlotKindSchema,
  x: AxisSpecSchema,
  y: AxisSpecSchema.optional(),
  style: PlotStyleSchema,
  /** One set of settings whatever the axes' channels; omitted = on. */
  styleFollow: z.boolean().optional(),
  /**
   * While `styleFollow` is off: the settings last used with each channel pair, keyed "x|y" ("x|" for a
   * histogram); switching the channels saves `style` under the old pair and restores the new pair's.
   */
  stylesByAxes: z.record(PlotStyleSchema).optional(),
  /** While `styleFollow` is off: the settings a channel pair not used yet starts from (those last applied to every pair; omitted = defaults). */
  styleBase: PlotStyleSchema.optional(),
});
export type PlotSpec = z.infer<typeof PlotSpecSchema>;

/** A read-only reference plot shown beside the gating plot in the Plot view. */
export const RefPlotSchema = z.object({
  id: Id,
  /** Population shown; omitted = follow the population being gated. */
  population: Id.optional(),
  /** Sample shown; omitted = follow the selected sample. */
  sampleId: Id.optional(),
  kind: PlotKindSchema,
  x: AxisSpecSchema,
  y: AxisSpecSchema.optional(),
  style: PlotStyleSchema,
  /** Overlay the population being gated, in its color. */
  backgate: z.boolean().default(false),
});
export type RefPlot = z.infer<typeof RefPlotSchema>;

/** One plot in a cell of the Plot view's grid. Gates can be drawn on it like on the Gate view's plot. */
export const PlotCellSchema = z.object({
  id: Id,
  population: Id,
  /** Sample gated and shown; omitted = follow the selected sample. */
  sampleId: Id.optional(),
  /** Further samples overlaid on the plot, each in its own color. */
  overlay: z.array(Id).default([]),
  kind: PlotKindSchema,
  x: AxisSpecSchema,
  y: AxisSpecSchema.optional(),
  style: PlotStyleSchema,
});
export type PlotCell = z.infer<typeof PlotCellSchema>;

/**
 * The Plot view's fixed grid: `cells` fill it row by row; null = empty cell. `size` is the plot size
 * picked (px); the number of columns follows the view's width to keep the plots near it. `columns` is
 * the number shown when it was picked, used for workspaces saved before `size`.
 */
export const PlotGridSchema = z.object({
  columns: z.number().int().min(1).max(12).default(3),
  size: z.number().int().positive().optional(),
  cells: z.array(PlotCellSchema.nullable()).default([]),
});
export type PlotGrid = z.infer<typeof PlotGridSchema>;
