import type { PanelSpec } from './settingsPanel.ts';

/**
 * Every settings panel's tabs and cards, with their labels and titles. To add a card, add it here and
 * render `<Card {...card('id')}>` in its tab; the title, open state and element id come from here.
 */

/** The tabs of the plot settings panel (Gate view, Tiles, Plot grid). */
export type PlotPanelTab = 'settings' | 'gate' | 'figure' | 'axis' | 'text';
/** The cards of the plot settings panel; the Gate tab has one card per gate. */
export type PlotCard =
  | 'plot'
  | 'overlay'
  | 'display'
  | 'baseFont'
  | 'xaxis'
  | 'yaxis'
  | 'ticks'
  | 'titleText'
  | 'tickText'
  | 'axisTitleText'
  | 'gateText'
  | `gate-${string}`
  | 'apply'
  | 'resetAll';

/** Which plots a plot settings panel edits: the Gate view's, the Tiles' or a Plot grid cell. */
export type PlotPanelTarget = 'gate' | 'tiles' | 'grid';

const plotPanel = (key: string, name: string): PanelSpec<PlotPanelTab, PlotCard> => ({
  key,
  idPrefix: 'gate',
  name,
  noun: 'plot',
  defaultTab: 'figure',
  tabs: [
    {
      id: 'figure',
      label: 'Figure',
      cards: { plot: 'Plot', overlay: 'Sample overlay', display: 'Display' },
    },
    { id: 'axis', label: 'Axis', cards: { xaxis: 'X axis', yaxis: 'Y axis', ticks: 'Ticks and spine' } },
    {
      id: 'text',
      label: 'Text',
      cards: {
        baseFont: 'Base font',
        titleText: 'Plot title',
        tickText: 'Tick labels',
        axisTitleText: 'Axis titles',
        gateText: 'Gate labels',
      },
    },
    { id: 'gate', label: 'Gate', cards: {}, resettable: false },
    {
      id: 'settings',
      label: 'Settings',
      cards: { apply: 'Apply settings', resetAll: 'Reset settings' },
      resettable: false,
    },
  ],
});

export const PLOT_PANELS: Record<PlotPanelTarget, PanelSpec<PlotPanelTab, PlotCard>> = {
  gate: plotPanel('flowmeris.gatePanelTab', 'Gate settings'),
  tiles: plotPanel('flowmeris.tilesPanelTab', 'Tiles settings'),
  grid: plotPanel('flowmeris.gridPanelTab', 'Plot settings'),
};

/** The tabs of the ridge plot settings panel. */
export type RidgePanelTab = 'sample' | 'axis' | 'text' | 'figure' | 'settings';
/** The cards of the ridge plot settings panel (the Sample tab has none). */
export type RidgeCard =
  | 'ridgeStyle'
  | 'labels'
  | 'layout'
  | 'histogram'
  | 'baseFont'
  | 'scale'
  | 'ticks'
  | 'title'
  | 'labelText'
  | 'tickText'
  | 'titleText'
  | 'apply'
  | 'resetAll';

export const RIDGE_PANEL: PanelSpec<RidgePanelTab, RidgeCard> = {
  key: 'flowmeris.ridgePanel',
  idPrefix: 'ridge',
  name: 'Ridge plot settings',
  noun: 'ridge plot',
  defaultTab: 'figure',
  tabs: [
    {
      id: 'figure',
      label: 'Figure',
      cards: {
        ridgeStyle: 'Ridge style',
        labels: 'Ridge labels',
        layout: 'Layout',
        histogram: 'Histogram',
      },
    },
    { id: 'sample', label: 'Sample', cards: {} },
    { id: 'axis', label: 'Axis', cards: { scale: 'Scale and range', ticks: 'Ticks', title: 'Title' } },
    {
      id: 'text',
      label: 'Text',
      cards: {
        baseFont: 'Base font',
        labelText: 'Ridge labels',
        tickText: 'Tick labels',
        titleText: 'Axis title',
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      cards: { apply: 'Apply settings', resetAll: 'Reset settings' },
      resettable: false,
    },
  ],
};

/** The tabs of the Charts view's settings panel. */
export type ChartPanelTab = 'figure' | 'axis' | 'text' | 'settings';
/** The cards of the Charts view's settings panel. */
export type ChartCard =
  | 'chart'
  | 'data'
  | 'marks'
  | 'size'
  | 'xAxis'
  | 'yAxis'
  | 'color'
  | 'grid'
  | 'baseFont'
  | 'tickText'
  | 'axisTitleText'
  | 'legend'
  | 'manage'
  | 'apply'
  | 'resetAll';

export const CHART_PANEL: PanelSpec<ChartPanelTab, ChartCard> = {
  key: 'flowmeris.chartPanel',
  idPrefix: 'chart',
  name: 'Chart settings',
  noun: 'chart',
  defaultTab: 'figure',
  tabs: [
    {
      id: 'figure',
      label: 'Figure',
      cards: { chart: 'Chart', data: 'Error and replicates', marks: 'Marks', size: 'Size' },
    },
    {
      id: 'axis',
      label: 'Axis',
      cards: { xAxis: 'X axis', yAxis: 'Y axis', color: 'Colour', grid: 'Gridlines' },
    },
    {
      id: 'text',
      label: 'Text',
      cards: {
        baseFont: 'Base font',
        tickText: 'Tick labels',
        axisTitleText: 'Axis titles',
        legend: 'Legend',
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      cards: { manage: 'Chart', apply: 'Apply settings', resetAll: 'Reset settings' },
      resettable: false,
    },
  ],
};

/** The tabs of the Statistics view's settings panel. */
export type StatsPanelTab = 'statistics' | 'replicates' | 'export';
/** The cards of the Statistics view's settings panel. */
export type StatsCard =
  | 'addStat'
  | 'derived'
  | 'combine'
  | 'summaries'
  | 'tableCsv'
  | 'statsCsv'
  | 'gatingMl'
  | 'events';

export const STATS_PANEL: PanelSpec<StatsPanelTab, StatsCard> = {
  key: 'flowmeris.statsPanel',
  idPrefix: 'stats',
  name: 'Statistics settings',
  noun: 'table',
  defaultTab: 'statistics',
  tabs: [
    {
      id: 'statistics',
      label: 'Statistics',
      cards: { addStat: 'New statistic', derived: 'Derived columns' },
    },
    {
      id: 'replicates',
      label: 'Replicates',
      cards: { combine: 'Combine replicates', summaries: 'Summaries' },
    },
    {
      id: 'export',
      label: 'Export',
      cards: {
        tableCsv: 'Statistics table',
        statsCsv: 'Statistics with provenance',
        gatingMl: 'Gates',
        events: 'Events',
      },
    },
  ],
};

/** The tabs of the Metadata view's settings panel. */
export type MetaPanelTab = 'variables' | 'values';
/** The cards of the Metadata view's settings panel: one per variable, and the Values tab's. */
export type MetaCard = `var-${string}` | 'setValue' | 'fillSeries';

/** The Metadata panel's tab follows the table or plate map, so only its collapsed cards are remembered. */
export const META_PANEL: PanelSpec<MetaPanelTab, MetaCard> = {
  key: 'flowmeris.metaPanel',
  idPrefix: 'meta',
  name: 'Metadata settings',
  noun: 'variable',
  defaultTab: 'variables',
  tabs: [
    { id: 'variables', label: 'Variables', cards: {} },
    { id: 'values', label: 'Values', cards: { setValue: 'Set value', fillSeries: 'Fill series' } },
  ],
};

/** Every panel, for the checks in `panelSpecs.test.ts`. */
export const ALL_PANELS: readonly PanelSpec<string, string>[] = [
  ...Object.values(PLOT_PANELS),
  RIDGE_PANEL,
  CHART_PANEL,
  STATS_PANEL,
  META_PANEL,
];
