import { type ChartStyle, type StatPlot, newId } from '@flowmeris/model';
import { DEFAULT_CHART_STYLE } from './chartStyle.ts';
import { jsonClone, sameJson } from './json.ts';
import { CHART_PANEL, type ChartCard, type ChartPanelTab } from './panelSpecs.ts';
import { cardsOfTab } from './settingsPanel.ts';

/** The Charts view's settings panel: its tabs and cards, their resets, and applying settings across charts. */

export type { ChartCard, ChartPanelTab } from './panelSpecs.ts';

/** Chart fields (outside `style`) a card resets. The columns, color-by variable, type and name are never reset. */
type PlotKey = 'xScale' | 'yScale' | 'xLabel' | 'yLabel' | 'error' | 'showPoints';

const PLOT_DEFAULTS: Pick<StatPlot, PlotKey> = {
  xScale: 'linear',
  yScale: 'linear',
  xLabel: undefined,
  yLabel: undefined,
  error: 'sem',
  showPoints: true,
};

interface CardKeys {
  style: (keyof ChartStyle)[];
  plot: PlotKey[];
}

/** The settings each card resets; cards not listed have nothing to reset. */
export const CHART_CARD_KEYS: Partial<Record<ChartCard, CardKeys>> = {
  data: { style: [], plot: ['error', 'showPoints'] },
  marks: {
    style: [
      'fillOpacity',
      'markerShape',
      'markerSize',
      'markerColor',
      'markerEdgeColor',
      'markerEdgeWidth',
      'meanLineWidth',
      'meanLineLength',
      'meanLineColor',
      'barWidth',
    ],
    plot: [],
  },
  // Bar charts show this card instead of the markers' (opacity and width are the same settings).
  bars: { style: ['fillOpacity', 'barWidth', 'barEdgeColor', 'barEdgeWidth'], plot: [] },
  line: { style: ['lineWidth', 'lineColor', 'lineDash'], plot: [] },
  errorBars: { style: ['errorWidth', 'capWidth', 'errorColor'], plot: [] },
  replicates: {
    style: ['pointShape', 'pointSize', 'pointColor', 'pointEdgeColor', 'pointEdgeWidth', 'pointOpacity'],
    plot: [],
  },
  size: { style: ['width', 'height'], plot: [] },
  xAxis: { style: ['xMin', 'xMax', 'xTicks'], plot: ['xScale', 'xLabel'] },
  yAxis: { style: ['yMin', 'yMax', 'yTicks'], plot: ['yScale', 'yLabel'] },
  color: { style: ['colorMode', 'color', 'seriesColors', 'seriesLabels', 'seriesOrder'], plot: [] },
  ticks: { style: ['tickColor', 'tickWidth', 'spineColor', 'spineWidth', 'boxAspect'], plot: [] },
  grid: { style: ['showGrid', 'gridColor', 'gridWidth'], plot: [] },
  baseFont: {
    style: ['fontFamily', 'fontColor', 'fontSize', 'tickFontSize', 'titleFontSize', 'legendFontSize'],
    plot: [],
  },
  tickText: { style: ['showTickLabels', 'tickFontSize', 'tickText'], plot: [] },
  axisTitleText: { style: ['titleFontSize', 'titleText'], plot: [] },
  legend: { style: ['legend', 'legendFontSize', 'legendText'], plot: [] },
};

/** Whether the settings of `card` are at their defaults for chart `p`. */
export function chartCardAtDefaults(p: StatPlot, card: ChartCard): boolean {
  const keys = CHART_CARD_KEYS[card];
  if (!keys) return true;
  return (
    keys.style.every((k) => sameJson(p.style[k], DEFAULT_CHART_STYLE[k])) &&
    keys.plot.every((k) => p[k] === PLOT_DEFAULTS[k])
  );
}

/** Reset the settings of `card` for chart `p` (call inside `mutate`). */
export function resetChartCard(p: StatPlot, card: ChartCard): void {
  const keys = CHART_CARD_KEYS[card];
  if (!keys) return;
  const style = p.style as Record<string, unknown>;
  for (const k of keys.style) {
    const v = DEFAULT_CHART_STYLE[k];
    if (v === undefined) delete style[k];
    else style[k] = structuredClone(v);
  }
  const plot = p as Record<string, unknown>;
  for (const k of keys.plot) {
    const v = PLOT_DEFAULTS[k];
    if (v === undefined) delete plot[k];
    else plot[k] = v;
  }
}

/** Whether every setting on tab `tab` is at its default for chart `p` (the Settings tab has none). */
export const chartPanelAtDefaults = (tab: ChartPanelTab, p: StatPlot) =>
  cardsOfTab(CHART_PANEL, tab).every((c) => chartCardAtDefaults(p, c));

/** Reset every setting on tab `tab` for chart `p` (call inside `mutate`). */
export function resetChartPanel(tab: ChartPanelTab, p: StatPlot): void {
  for (const c of cardsOfTab(CHART_PANEL, tab)) resetChartCard(p, c);
}

const ALL_CARDS = Object.keys(CHART_CARD_KEYS) as ChartCard[];

/** Whether all of chart `p`'s settings are at their defaults. */
export const chartAtDefaults = (p: StatPlot) => ALL_CARDS.every((c) => chartCardAtDefaults(p, c));

/** Reset all of chart `p`'s settings (call inside `mutate`); its columns, type and groups shown stay. */
export function resetChart(p: StatPlot): void {
  for (const c of ALL_CARDS) resetChartCard(p, c);
}

/** Settings that depend on the x column, the y column, or the color-by variable. */
const X_KEYS: CardKeys = { style: ['xMin', 'xMax', 'xTicks'], plot: ['xScale'] };
const Y_KEYS: CardKeys = { style: ['yMin', 'yMax', 'yTicks'], plot: ['yScale'] };
const SERIES_KEYS: CardKeys = { style: ['seriesColors', 'seriesLabels', 'seriesOrder'], plot: [] };

function copyKeys(from: StatPlot, to: StatPlot, keys: CardKeys) {
  const style = to.style as Record<string, unknown>;
  for (const k of keys.style) {
    const v = from.style[k];
    if (v === undefined) delete style[k];
    else style[k] = jsonClone(v);
  }
  const plot = to as Record<string, unknown>;
  for (const k of keys.plot) {
    const v = from[k];
    if (v === undefined) delete plot[k];
    else plot[k] = v;
  }
}

/**
 * Give `to` the settings of `from`. Each chart keeps its axis titles; an axis's scale, range and ticks go
 * only to charts plotting the same column on that axis, and series colors, labels and order only to
 * charts colored by the same variable.
 */
export function copyChartSettings(from: StatPlot, to: StatPlot): void {
  const skip = new Set<keyof ChartStyle | PlotKey>([
    'xLabel',
    'yLabel',
    ...X_KEYS.style,
    ...X_KEYS.plot,
    ...Y_KEYS.style,
    ...Y_KEYS.plot,
    ...SERIES_KEYS.style,
  ]);
  for (const c of ALL_CARDS) {
    const keys = CHART_CARD_KEYS[c]!;
    copyKeys(from, to, {
      style: keys.style.filter((k) => !skip.has(k)),
      plot: keys.plot.filter((k) => !skip.has(k)),
    });
  }
  if (from.x === to.x) copyKeys(from, to, X_KEYS);
  if (from.y === to.y) copyKeys(from, to, Y_KEYS);
  if (from.series === to.series) copyKeys(from, to, SERIES_KEYS);
}

/** Apply chart `fromId`'s settings to the other charts (call inside `mutate`); see `copyChartSettings`. */
export function applyChartToAll(plots: StatPlot[], fromId: string): void {
  const from = plots.find((p) => p.id === fromId);
  if (!from) return;
  for (const p of plots) if (p !== from) copyChartSettings(from, p);
}

/** Whether applying chart `fromId`'s settings to the other charts would change nothing. */
export function chartsMatch(plots: StatPlot[], fromId: string): boolean {
  const from = plots.find((p) => p.id === fromId);
  if (!from) return true;
  return plots.every((p) => {
    if (p === from) return true;
    const to = jsonClone(p);
    copyChartSettings(from, to);
    return sameJson(to, p);
  });
}

/** A copy of chart `from` with its own id, named "<name> copy". */
export function duplicateChart(from: StatPlot): StatPlot {
  return { ...structuredClone(from), id: newId('sp_'), name: `${from.name} copy` };
}
