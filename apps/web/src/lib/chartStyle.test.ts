import type { ColumnDef, PlotSeries } from '@flowmeris/table';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHART_STYLE,
  cellText,
  chartCsvRows,
  columnGroups,
  defaultPlot,
  fmtChart,
  orderSeries,
  seriesColor,
  seriesKey,
} from './chartStyle.ts';

const col = (key: string, kind: ColumnDef['kind'], type: ColumnDef['type'] = 'numeric'): ColumnDef => ({
  key,
  label: key,
  kind,
  type,
});
const series = (key: PlotSeries['key']): PlotSeries => ({ key, points: [] });

describe('chart series', () => {
  it('are ordered by the saved order, then the rest in their own order', () => {
    const s = [series('a'), series('b'), series('c'), series(undefined)];
    expect(orderSeries(s, []).map((x) => x.key)).toEqual(['a', 'b', 'c', undefined]);
    expect(orderSeries(s, [seriesKey('c'), seriesKey(undefined)]).map((x) => x.key)).toEqual([
      'c',
      undefined,
      'a',
      'b',
    ]);
  });

  it('take a custom colour, else the palette by index, else the single colour', () => {
    const st = { ...DEFAULT_CHART_STYLE, seriesColors: { '"a"': '#123456' } };
    expect(seriesColor(st, '"a"', 0)).toBe('#123456');
    expect(seriesColor(st, '"b"', 1)).not.toBe(seriesColor(st, '"c"', 2));
    expect(seriesColor({ ...st, colorMode: 'single', color: '#ff0000' }, '"b"', 1)).toBe('#ff0000');
  });
});

describe('chart text', () => {
  it('shows 5 significant figures, exponential when very small or large', () => {
    expect(fmtChart(1234.5678)).toBe('1234.6');
    expect(fmtChart(0.0001234)).toBe('1.234e-4');
    expect(fmtChart(2e6)).toBe('2.000e+6');
    expect(fmtChart(0)).toBe('0');
    expect(fmtChart(Number.NaN)).toBe('—');
    expect(cellText(undefined)).toBe('');
    expect(cellText('A')).toBe('A');
  });
});

describe('a new chart', () => {
  it('plots a statistic against a numeric variable, coloured by a categorical one', () => {
    const cols = [
      col('sample:name', 'sample', 'categorical'),
      col('var:cond', 'variable', 'categorical'),
      col('var:dose', 'variable'),
      col('p|count', 'stat'),
      col('st_1', 'stat'),
    ];
    const p = defaultPlot(cols, 2);
    expect(p).toMatchObject({ name: 'Chart 3', kind: 'line', x: 'var:dose', y: 'st_1', series: 'cond' });
    expect(p.style).toEqual(DEFAULT_CHART_STYLE);
  });

  it('prefers a derived column, and draws bars against categories', () => {
    const cols = [
      col('sample:name', 'sample', 'categorical'),
      col('p|pctParent', 'stat'),
      col('derived:d', 'derived'),
    ];
    expect(defaultPlot(cols, 0)).toMatchObject({ kind: 'bar', x: 'sample:name', y: 'derived:d' });
    expect(defaultPlot(cols, 0).series).toBeUndefined();
  });
});

describe('chart columns and data', () => {
  it('lists columns under Variables, Statistics and Derived, leaving out empty headings', () => {
    const groups = columnGroups([col('sample:name', 'sample', 'categorical'), col('st_1', 'stat')]);
    expect(groups.map((g) => [g.title, g.cols.map((c) => c.key)])).toEqual([
      ['Variables', ['sample:name']],
      ['Statistics', ['st_1']],
    ]);
  });

  it('exports one row per point, with the series label and error when shown', () => {
    const plot = {
      ...defaultPlot([col('var:dose', 'variable'), col('st_1', 'stat')], 0),
      error: 'sd' as const,
    };
    plot.style.seriesLabels = { '"a"': 'Treated' };
    const summary: PlotSeries[] = [
      { key: 'a', points: [{ x: 1, mean: 2, err: 0.5, n: 3, values: [], rowIds: [] }] },
      { key: 'b', points: [{ x: 1, mean: 4, err: 1, n: 2, values: [], rowIds: [] }] },
    ];
    expect(chartCsvRows(plot, summary, { series: 'Cond', x: 'Dose', y: 'Median' })).toEqual([
      ['Cond', 'Dose', 'Median (mean)', 'SD', 'n'],
      ['Treated', 1, 2, 0.5, 3],
      ['b', 1, 4, 1, 2],
    ]);
    expect(
      chartCsvRows({ ...plot, error: 'none' }, summary, { series: undefined, x: 'Dose', y: 'Median' }),
    ).toEqual([
      ['Dose', 'Median (mean)', 'n'],
      [1, 2, 3],
      [1, 4, 2],
    ]);
  });
});
