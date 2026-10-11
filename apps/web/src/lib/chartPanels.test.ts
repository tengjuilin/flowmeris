import type { StatPlot } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import {
  CHART_CARD_KEYS,
  applyChartToAll,
  chartAtDefaults,
  chartCardAtDefaults,
  chartPanelAtDefaults,
  chartsMatch,
  duplicateChart,
  resetChart,
  resetChartCard,
  resetChartPanel,
} from './chartPanels.ts';
import { DEFAULT_CHART_STYLE } from './chartStyle.ts';
import { CHART_PANEL } from './panelSpecs.ts';
import { cardsOfTab } from './settingsPanel.ts';

function chart(id: string, over: Partial<StatPlot> = {}): StatPlot {
  return {
    id,
    name: id,
    kind: 'line',
    x: 'var:dose',
    y: 'root|count',
    series: 'cond',
    xScale: 'linear',
    yScale: 'linear',
    error: 'sem',
    showPoints: true,
    hiddenPoints: [],
    excludeRows: [],
    style: structuredClone(DEFAULT_CHART_STYLE),
    ...over,
  };
}

describe('chart settings panel', () => {
  it('a new chart is at the defaults on every tab', () => {
    const p = chart('a');
    expect(chartAtDefaults(p)).toBe(true);
    for (const tab of ['figure', 'axis', 'text', 'settings'] as const)
      expect(chartPanelAtDefaults(tab, p)).toBe(true);
  });

  it('every card with settings is on exactly one tab', () => {
    const onTabs = CHART_PANEL.tabs.flatMap((t) => cardsOfTab(CHART_PANEL, t.id));
    for (const card of Object.keys(CHART_CARD_KEYS)) expect(onTabs.filter((c) => c === card)).toHaveLength(1);
  });

  it('marker shape and edge, error bar color, ticks and spines reset with their cards', () => {
    const p = chart('a');
    Object.assign(p.style, {
      markerShape: 'hline',
      meanLineColor: '#000000',
      markerEdgeColor: '#111111',
      errorColor: '#222222',
      tickColor: '#333333',
      spineWidth: 2,
      boxAspect: 1.5,
    });
    expect(chartPanelAtDefaults('axis', p)).toBe(false);
    resetChartPanel('axis', p);
    expect([p.style.tickColor, p.style.spineWidth, p.style.boxAspect]).toEqual([undefined, 1, undefined]);
    expect(chartCardAtDefaults(p, 'errorBars')).toBe(false);
    resetChartCard(p, 'errorBars');
    expect(p.style.errorColor).toBeUndefined();
    resetChartCard(p, 'marks');
    expect([p.style.markerShape, p.style.meanLineColor, p.style.markerEdgeColor]).toEqual([
      'circle',
      undefined,
      undefined,
    ]);
    expect(chartAtDefaults(p)).toBe(true);
  });

  it('a card reset clears only its own settings', () => {
    const p = chart('a', { xLabel: 'Dose', error: 'sd' });
    p.style.markerSize = 9;
    p.style.xMin = 1;
    p.style.seriesColors = { '"A"': '#ff0000' };
    expect(chartCardAtDefaults(p, 'marks')).toBe(false);
    expect(chartCardAtDefaults(p, 'xAxis')).toBe(false);
    expect(chartCardAtDefaults(p, 'color')).toBe(false);
    expect(chartCardAtDefaults(p, 'data')).toBe(false);
    resetChartCard(p, 'xAxis');
    expect(p.xLabel).toBeUndefined();
    expect('xMin' in p.style).toBe(false);
    expect(p.style.markerSize).toBe(9);
    expect(chartCardAtDefaults(p, 'xAxis')).toBe(true);
    resetChartCard(p, 'data');
    expect(p.error).toBe('sem');
  });

  it('the text cards reset their text styles and the base font resets its color and sizes', () => {
    const p = chart('a');
    p.style.tickText = { bold: true, italic: false, underline: false };
    p.style.legendText = { bold: false, italic: true, underline: false, color: '#ff0000' };
    p.style.fontColor = '#333333';
    p.style.fontSize = 18;
    expect(chartCardAtDefaults(p, 'tickText')).toBe(false);
    expect(chartCardAtDefaults(p, 'legend')).toBe(false);
    expect(chartCardAtDefaults(p, 'baseFont')).toBe(false);
    resetChartCard(p, 'tickText');
    expect(p.style.tickText.bold).toBe(false);
    expect(p.style.legendText.italic).toBe(true);
    resetChartCard(p, 'baseFont');
    expect('fontColor' in p.style).toBe(false);
    expect(p.style.fontSize).toBe(DEFAULT_CHART_STYLE.fontSize);
    expect(chartPanelAtDefaults('text', p)).toBe(false);
    resetChartPanel('text', p);
    expect(chartPanelAtDefaults('text', p)).toBe(true);
  });

  it('a tab reset covers the cards on that tab and leaves the columns', () => {
    const p = chart('a', { yScale: 'log10', x: 'var:time' });
    p.style.legend = 'none';
    p.style.height = 300;
    expect(chartPanelAtDefaults('axis', p)).toBe(false);
    expect(chartPanelAtDefaults('text', p)).toBe(false);
    expect(chartPanelAtDefaults('figure', p)).toBe(false);
    resetChartPanel('axis', p);
    expect(p.yScale).toBe('linear');
    expect(p.x).toBe('var:time');
    expect(p.series).toBe('cond');
    expect(chartPanelAtDefaults('text', p)).toBe(false);
    resetChart(p);
    expect(chartAtDefaults(p)).toBe(true);
    expect(p.style).toEqual(DEFAULT_CHART_STYLE);
  });
});

describe('applying a chart’s settings to the other charts', () => {
  it('copies the look; axis settings only to the same column, series settings only to the same variable', () => {
    const a = chart('a', { xScale: 'log10', yLabel: 'Count', showPoints: false });
    a.style.markerSize = 8;
    a.style.legend = 'right';
    a.style.yMax = 100;
    a.style.seriesColors = { '"A"': '#ff0000' };
    const sameCols = chart('b');
    const other = chart('c', { x: 'var:time', y: 'root|pctParent', series: undefined });
    const plots = [a, sameCols, other];
    expect(chartsMatch(plots, 'a')).toBe(false);
    applyChartToAll(plots, 'a');
    expect(sameCols.style.markerSize).toBe(8);
    expect(sameCols.style.legend).toBe('right');
    expect(sameCols.showPoints).toBe(false);
    expect(sameCols.xScale).toBe('log10');
    expect(sameCols.style.yMax).toBe(100);
    expect(sameCols.style.seriesColors).toEqual({ '"A"': '#ff0000' });
    expect(sameCols.yLabel).toBeUndefined();
    expect(other.style.markerSize).toBe(8);
    expect(other.xScale).toBe('linear');
    expect(other.style.yMax).toBeUndefined();
    expect(other.style.seriesColors).toEqual({});
    expect(chartsMatch(plots, 'a')).toBe(true);
  });

  it('copies unset optional settings as unset', () => {
    const a = chart('a');
    const b = chart('b');
    b.style.barWidth = 0.5;
    b.style.width = 600;
    applyChartToAll([a, b], 'a');
    expect('barWidth' in b.style).toBe(false);
    expect('width' in b.style).toBe(false);
  });
});

describe('duplicateChart', () => {
  it('copies the chart under a new id and name', () => {
    const a = chart('sp_a');
    a.style.markerSize = 7;
    const b = duplicateChart(a);
    expect(b.id).not.toBe(a.id);
    expect(b.name).toBe('sp_a copy');
    expect(b.style).toEqual(a.style);
    expect(b.style).not.toBe(a.style);
  });
});
