import { z } from 'zod';
import { HexColor, Id, Num } from './common.ts';
import { TextStyleSchema } from './figure.ts';
import { AxisSpecSchema } from './plot.ts';

/** Appearance of a ridge plot. Every member has a default, so `RidgeStyleSchema.parse({})` is the default style. */
export const RidgeStyleSchema = z.object({
  /** 'single': every ridge uses `color`; 'palette': ridges cycle the categorical palette. */
  colorMode: z.enum(['single', 'palette']).default('single'),
  color: HexColor.default('#2a78d6'),
  /** Per-ridge fill colours, overriding `colorMode`. Keyed by ridge id (see `order`). */
  sampleColors: z.record(HexColor).default({}),
  fillOpacity: Num.min(0).max(1).default(0.55),
  /** Outline colour; omitted = the plot background. */
  strokeColor: HexColor.optional(),
  strokeWidth: Num.min(0).max(10).default(1.25),
  /** Row pitch in px; omitted = fit (18–60 px, about 600 px in total). */
  rowHeight: Num.min(8).max(400).optional(),
  /** Plot width in px; omitted = fit the view. */
  width: Num.min(300).max(10000).optional(),
  /** Figure width ÷ height; omitted = free. When set, the row pitch is derived to fit the height (overrides `rowHeight`). */
  aspect: Num.min(0.2).max(10).optional(),
  /** A key of the app's font list, or the name of any installed font. */
  fontFamily: z.string().min(1).max(80).default('arial'),
  /**
   * Base font size (px). Editing it rescales the label, tick and title sizes by the same ratio, so
   * their relative sizes are kept; each can still be set on its own afterwards.
   */
  fontSize: Num.min(4).max(48).default(11.5),
  /** Color of all ridge text (labels, ticks, axis title) unless a text style sets its own. */
  fontColor: HexColor.default('#000000'),
  /**
   * Display order of ridges; ridges not listed follow in default order. A ridge id is a sample id, or
   * `combo:<JSON of the grouping variables' values>` for combined replicates (see `RidgeCombineSchema`).
   */
  order: z.array(Id).default([]),
  /** Per-ridge label text, overriding the short sample name or the combined values. Keyed by ridge id. */
  sampleLabels: z.record(z.string()).default({}),
  showLabels: z.boolean().default(true),
  showCounts: z.boolean().default(true),
  /** Put the event count on its own line below the label instead of after it. */
  countOnNewLine: z.boolean().default(false),
  labelFontSize: Num.min(4).max(48).default(11.5),
  /** Long labels: 'wrap' onto several lines within `labelWidth`, or 'widen' the label column to fit. */
  labelOverflow: z.enum(['wrap', 'widen']).default('widen'),
  /** Alignment of the ridge labels within the label column. */
  labelAlign: z.enum(['start', 'middle', 'end']).default('end'),
  /** Width of the label column in px. */
  labelWidth: Num.min(0).max(1000).default(240),
  /** Color of the axis tick marks; omitted = the theme's grid color. */
  axisColor: HexColor.optional(),
  /** Tick mark line width (px). */
  tickWidth: Num.min(0).max(10).default(1),
  /** Color of the frame around the plot area; omitted = the theme's border color. */
  spineColor: HexColor.optional(),
  /** Frame line width (px). */
  spineWidth: Num.min(0).max(10).default(1),
  /** Color of the thin baseline under each ridge; omitted = the theme's border color. */
  baselineColor: HexColor.optional(),
  showTickLabels: z.boolean().default(true),
  tickFontSize: Num.min(4).max(48).default(11),
  /** Tick marks in data (linear) units; omitted = automatic. A missing label is formatted from the value. */
  ticks: z.array(z.object({ value: Num, label: z.string().optional() })).optional(),
  /** Axis title; omitted = "<marker> :: <channel>". */
  axisTitle: z.string().optional(),
  titleFontSize: Num.min(4).max(48).default(12),
  /** Appearance of the ridge labels, the x tick labels and the axis title. */
  labelText: TextStyleSchema.default({}),
  tickText: TextStyleSchema.default({}),
  titleText: TextStyleSchema.default({ bold: true }),
  /** Histogram bins across the x range. */
  bins: z.number().int().min(16).max(1024).default(256),
  /** Gaussian smoothing of each histogram, in bins (σ); 0 = none. */
  smoothing: Num.min(0).max(20).default(1.5),
});
export type RidgeStyle = z.infer<typeof RidgeStyleSchema>;

/** Combining replicate samples into one ridge per combination of sample-variable values. */
export const RidgeCombineSchema = z.object({
  enabled: z.boolean().default(false),
  /** Variable ids; samples sharing all their values form one ridge. Empty = every sample in one ridge. */
  by: z.array(Id).default([]),
  /**
   * 'mean': each replicate's histogram is normalised to unit area and the curves are averaged, so every
   * replicate weighs the same. 'pool': the replicates' events are counted together.
   */
  method: z.enum(['mean', 'pool']).default('mean'),
  /** Spread band around the mean curve (method 'mean' only). */
  band: z.enum(['none', 'sd', 'sem']).default('none'),
  /** Combined ridges left out of the plot (ridge ids, `combo:…`). */
  hidden: z.array(Id).default([]),
  /** Replicate samples left out of their combined ridge. */
  exclude: z.array(Id).default([]),
});
export type RidgeCombine = z.infer<typeof RidgeCombineSchema>;

/** A ridge plot's appearance and overlap, saved per axis channel. */
export const RidgeSettingsSchema = z.object({
  style: RidgeStyleSchema.default({}),
  overlap: Num.min(0).max(0.95),
});
export type RidgeSettings = z.infer<typeof RidgeSettingsSchema>;

export const LayoutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tiles'), id: Id, plotId: Id, columns: z.number().int().min(1).max(16) }),
  z.object({
    kind: z.literal('ridge'),
    id: Id,
    population: Id,
    axis: AxisSpecSchema,
    overlap: Num.min(0).max(0.95),
    norm: z.enum(['mode', 'area']),
    style: RidgeStyleSchema.default({}),
    combine: RidgeCombineSchema.default({}),
    /** One set of settings whatever the axis channel; omitted = on. */
    styleFollow: z.boolean().optional(),
    /**
     * The settings last used with each axis channel; switching the channel saves `style` and `overlap`
     * under the old one and, while `styleFollow` is off, restores the new one's.
     */
    stylesByChannel: z.record(RidgeSettingsSchema).optional(),
    /** While `styleFollow` is off: the settings a channel not used yet starts from (those last applied to every channel; omitted = defaults). */
    styleBase: RidgeSettingsSchema.optional(),
  }),
]);
export type Layout = z.infer<typeof LayoutSchema>;
export type RidgeLayout = Extract<Layout, { kind: 'ridge' }>;
