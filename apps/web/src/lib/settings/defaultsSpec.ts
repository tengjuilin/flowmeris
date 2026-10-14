import { COLORMAPS } from '@flowmeris/render';

/**
 * The default appearance the Settings dialog edits: its sections and their fields, with each field's
 * label, kind and limits (those of the workspace schema). Fields not listed (titles, ticks, per-series
 * colors, sizes of one chart) belong to one figure and have no default to edit.
 */

export type DefaultsSection = 'plot' | 'figure' | 'tile' | 'ridge' | 'ridgeLayout' | 'chart';

export type FieldSpec = { key: string; label: string; title?: string } & (
  | { kind: 'number'; min: number; max: number; step?: number; int?: boolean }
  /** `optional`: may be unset (drawn in the theme's color); its text says what unset means. */
  | { kind: 'color'; optional?: string }
  | { kind: 'font' }
  | { kind: 'bool' }
  | { kind: 'select'; options: readonly (readonly [value: string | number, label: string])[] }
);

export interface CardSpec {
  id: string;
  title: string;
  section: DefaultsSection;
  fields: FieldSpec[];
}

export interface DefaultsTabSpec {
  id: 'plots' | 'ridges' | 'charts';
  title: string;
  /** What these defaults reach, shown above the cards. */
  intro: string;
  cards: CardSpec[];
}

const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  step = 0.5,
  title?: string,
): FieldSpec => ({
  key,
  label,
  kind: 'number',
  min,
  max,
  step,
  ...(title && { title }),
});
const int = (key: string, label: string, min: number, max: number): FieldSpec => ({
  key,
  label,
  kind: 'number',
  min,
  max,
  step: 1,
  int: true,
});
const size = (key: string, label: string) => num(key, label, 4, 48);
const width = (key: string, label: string) => num(key, label, 0, 10, 0.25);
const color = (key: string, label: string, optional?: string): FieldSpec => ({
  key,
  label,
  kind: 'color',
  ...(optional && { optional }),
});
const bool = (key: string, label: string): FieldSpec => ({ key, label, kind: 'bool' });
const font = (key: string, label = 'Font'): FieldSpec => ({ key, label, kind: 'font' });
const select = (
  key: string,
  label: string,
  options: Extract<FieldSpec, { kind: 'select' }>['options'],
): FieldSpec => ({
  key,
  label,
  kind: 'select',
  options,
});

const THEME = 'Theme color';

export const DEFAULTS_TABS: DefaultsTabSpec[] = [
  {
    id: 'plots',
    title: 'Plots',
    intro: 'Plots of the Gate, Plot grid, Tiles and Gating path views.',
    cards: [
      {
        id: 'plot-display',
        title: 'Display',
        section: 'plot',
        fields: [
          select(
            'colormap',
            'Color map',
            COLORMAPS.map((c) => [c, c] as const),
          ),
          num('pointPx', 'Point size (px)', 0.25, 10, 0.25),
          num('smoothPct', 'Smoothing σ (% of axis)', 0, 10, 0.25),
          bool('showOutliers', 'Show outliers'),
          num('outlierPx', 'Outlier size (px)', 0.25, 10, 0.25),
          color('outlierColor', 'Outlier color'),
          width('contourWidth', 'Contour line width (px)'),
          color('contourColor', 'Contour line color', THEME),
          bool('zebraLines', 'Zebra contour lines'),
          int('histBins', 'Histogram bins', 16, 1024),
          select('histNorm', 'Histogram height', [
            ['mode', 'Fraction of mode'],
            ['count', 'Count'],
            ['area', 'Density (unit area)'],
          ]),
          bool('histSmooth', 'Smooth histograms'),
        ],
      },
      {
        id: 'plot-text',
        title: 'Text (Gate view)',
        section: 'figure',
        fields: [
          font('fontFamily'),
          color('fontColor', 'Font color'),
          size('fontSize', 'Base size (px)'),
          size('titleFontSize', 'Title size (px)'),
          size('tickFontSize', 'Tick label size (px)'),
          size('axisTitleFontSize', 'Axis title size (px)'),
          size('gateFontSize', 'Gate label size (px)'),
        ],
      },
      {
        id: 'plot-tile-text',
        title: 'Text (Plot grid and Tiles)',
        section: 'tile',
        fields: [
          size('fontSize', 'Base size (px)'),
          size('titleFontSize', 'Title size (px)'),
          size('tickFontSize', 'Tick label size (px)'),
          size('axisTitleFontSize', 'Axis title size (px)'),
          size('gateFontSize', 'Gate label size (px)'),
        ],
      },
      {
        id: 'plot-axes',
        title: 'Axes and frame',
        section: 'figure',
        fields: [
          bool('showTickLabels', 'Tick labels'),
          color('axisColor', 'Tick color', THEME),
          width('tickWidth', 'Tick width (px)'),
          color('spineColor', 'Frame color', THEME),
          width('spineWidth', 'Frame width (px)'),
          num('boxAspect', 'Plot box width ÷ height', 0.2, 10, 0.1),
          bool('showOffScaleNote', 'Off-scale note'),
        ],
      },
    ],
  },
  {
    id: 'ridges',
    title: 'Ridges',
    intro: 'Ridge plots of the Ridge view.',
    cards: [
      {
        id: 'ridge-curves',
        title: 'Ridges',
        section: 'ridge',
        fields: [
          select('colorMode', 'Colors', [
            ['single', 'One color'],
            ['palette', 'Palette'],
          ]),
          color('color', 'Fill color'),
          num('fillOpacity', 'Fill opacity', 0, 1, 0.05),
          color('strokeColor', 'Outline color', 'Background color'),
          width('strokeWidth', 'Outline width (px)'),
          color('baselineColor', 'Baseline color', THEME),
          int('bins', 'Bins', 16, 1024),
          num('smoothing', 'Smoothing σ (bins)', 0, 20, 0.25),
        ],
      },
      {
        id: 'ridge-layout',
        title: 'Layout',
        section: 'ridgeLayout',
        fields: [num('overlap', 'Overlap', 0, 0.95, 0.05)],
      },
      {
        id: 'ridge-text',
        title: 'Text',
        section: 'ridge',
        fields: [
          font('fontFamily'),
          color('fontColor', 'Font color'),
          size('fontSize', 'Base size (px)'),
          size('labelFontSize', 'Label size (px)'),
          size('tickFontSize', 'Tick label size (px)'),
          size('titleFontSize', 'Axis title size (px)'),
          bool('showLabels', 'Labels'),
          bool('showCounts', 'Event counts'),
          num('labelWidth', 'Label column width (px)', 0, 1000, 10),
        ],
      },
      {
        id: 'ridge-axes',
        title: 'Axes and frame',
        section: 'ridge',
        fields: [
          bool('showTickLabels', 'Tick labels'),
          color('axisColor', 'Tick color', THEME),
          width('tickWidth', 'Tick width (px)'),
          color('spineColor', 'Frame color', THEME),
          width('spineWidth', 'Frame width (px)'),
        ],
      },
    ],
  },
  {
    id: 'charts',
    title: 'Charts',
    intro: 'Charts of the Charts view.',
    cards: [
      {
        id: 'chart-marks',
        title: 'Marks',
        section: 'chart',
        fields: [
          select('colorMode', 'Colors', [
            ['palette', 'Palette'],
            ['single', 'One color'],
          ]),
          color('color', 'Color'),
          select('markerShape', 'Mean marker', [
            ['circle', 'Circle'],
            ['square', 'Square'],
            ['triangle', 'Triangle'],
            ['diamond', 'Diamond'],
            ['hline', 'Horizontal line'],
          ]),
          num('markerSize', 'Mean marker size (px)', 0, 30),
          width('lineWidth', 'Line width (px)'),
          width('errorWidth', 'Error bar width (px)'),
          width('barEdgeWidth', 'Bar outline width (px)'),
          num('fillOpacity', 'Opacity', 0, 1, 0.05),
          select('pointShape', 'Replicate points', [
            ['circle', 'Circle'],
            ['square', 'Square'],
            ['triangle', 'Triangle'],
            ['diamond', 'Diamond'],
          ]),
          num('pointSize', 'Replicate point size (px)', 0, 20),
        ],
      },
      {
        id: 'chart-text',
        title: 'Text and legend',
        section: 'chart',
        fields: [
          font('fontFamily'),
          color('fontColor', 'Font color', THEME),
          size('fontSize', 'Base size (px)'),
          size('tickFontSize', 'Tick label size (px)'),
          size('titleFontSize', 'Axis title size (px)'),
          size('legendFontSize', 'Legend size (px)'),
          select('legend', 'Legend', [
            ['top', 'Top'],
            ['bottom', 'Bottom'],
            ['left', 'Left'],
            ['right', 'Right'],
            ['inside-top-left', 'Inside, top left'],
            ['inside-top-right', 'Inside, top right'],
            ['inside-bottom-left', 'Inside, bottom left'],
            ['inside-bottom-right', 'Inside, bottom right'],
            ['none', 'None'],
          ]),
        ],
      },
      {
        id: 'chart-axes',
        title: 'Axes, grid and size',
        section: 'chart',
        fields: [
          bool('showTickLabels', 'Tick labels'),
          bool('showGrid', 'Gridlines'),
          color('gridColor', 'Gridline color', THEME),
          width('gridWidth', 'Gridline width (px)'),
          color('tickColor', 'Tick color', THEME),
          width('tickWidth', 'Tick width (px)'),
          color('spineColor', 'Axis line color', THEME),
          width('spineWidth', 'Axis line width (px)'),
          num('height', 'Height (px)', 160, 10000, 10),
        ],
      },
    ],
  },
];

/** Every field of every section. */
export const SECTION_FIELDS: Record<DefaultsSection, FieldSpec[]> = (() => {
  const out: Record<DefaultsSection, FieldSpec[]> = {
    plot: [],
    figure: [],
    tile: [],
    ridge: [],
    ridgeLayout: [],
    chart: [],
  };
  for (const tab of DEFAULTS_TABS) for (const c of tab.cards) out[c.section].push(...c.fields);
  return out;
})();

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Whether `v` is a valid value of field `f`; undefined is valid for an optional color only. */
export function validField(f: FieldSpec, v: unknown): boolean {
  switch (f.kind) {
    case 'number':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= f.min &&
        v <= f.max &&
        (!f.int || Number.isInteger(v))
      );
    case 'color':
      return (v === undefined && !!f.optional) || (typeof v === 'string' && HEX.test(v));
    case 'font':
      return typeof v === 'string' && v.trim().length > 0 && v.length <= 80;
    case 'bool':
      return typeof v === 'boolean';
    case 'select':
      return f.options.some(([o]) => o === v);
  }
}
