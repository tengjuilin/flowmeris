import { z } from 'zod';
import { HexColor, Num } from './common.ts';

/** Appearance of one kind of text in a figure. */
export const TextStyleSchema = z.object({
  /** Omitted = the figure's font. */
  fontFamily: z.string().min(1).max(80).optional(),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  /** Omitted = the figure's font color. */
  color: HexColor.optional(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

/** Figure options of a Gate-view plot: title, fonts, ticks and axis titles. `PlotFigureSchema.parse({})` is the default. */
export const PlotFigureSchema = z.object({
  /** Plot title above the plot; omitted = none. */
  title: z.string().optional(),
  /** A key of the app's font list, or the name of any installed font. */
  fontFamily: z.string().min(1).max(80).default('arial'),
  /** Base font size (px); editing it rescales the title, tick and axis title sizes by the same ratio. */
  fontSize: Num.min(4).max(48).default(14),
  /** Color of all plot text unless a text style sets its own. */
  fontColor: HexColor.default('#000000'),
  titleFontSize: Num.min(4).max(48).default(18),
  tickFontSize: Num.min(4).max(48).default(14),
  axisTitleFontSize: Num.min(4).max(48).default(15.5),
  titleText: TextStyleSchema.default({ bold: true }),
  tickText: TextStyleSchema.default({}),
  axisTitleText: TextStyleSchema.default({ bold: true }),
  /** Gate names and percentages drawn on the plot. */
  gateFontSize: Num.min(4).max(48).default(14.5),
  gateText: TextStyleSchema.default({ bold: true }),
  /** The "n off-scale (piled on edges)" note below the plot. */
  showOffScaleNote: z.boolean().default(true),
  /** Color of the axis tick marks; omitted = the theme's grid color. */
  axisColor: HexColor.optional(),
  /** Tick mark line width (px). */
  tickWidth: Num.min(0).max(10).default(1),
  /** Color of the frame around the plot area; omitted = the theme's border color. */
  spineColor: HexColor.optional(),
  /** Frame line width (px). */
  spineWidth: Num.min(0).max(10).default(1),
  /** Width ÷ height of the plot area inside the spine; omitted = fill the space given. */
  boxAspect: Num.min(0.2).max(10).optional(),
  showTickLabels: z.boolean().default(true),
  /** Tick marks in data (linear) units; omitted = automatic. A missing label is formatted from the value. */
  xTicks: z.array(z.object({ value: Num, label: z.string().optional() })).optional(),
  yTicks: z.array(z.object({ value: Num, label: z.string().optional() })).optional(),
  /** Axis titles; omitted = "<marker> :: <channel>". */
  xTitle: z.string().optional(),
  yTitle: z.string().optional(),
});
export type PlotFigure = z.infer<typeof PlotFigureSchema>;
