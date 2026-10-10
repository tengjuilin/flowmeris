import { type ChartStyle, ChartStyleSchema, type StatPlot, newId } from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import type { Cell, ColumnDef, PlotSeries } from '@flowmeris/table';

/** Styles, series and data of the statistics charts (Charts view). */

export const DEFAULT_CHART_STYLE: ChartStyle = ChartStyleSchema.parse({});

export const CHART_ERRORS: { id: StatPlot['error']; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'sd', label: 'SD' },
  { id: 'sem', label: 'SEM' },
  { id: 'ci95', label: '95% CI' },
];

export const CHART_KINDS: { id: StatPlot['kind']; label: string }[] = [
  { id: 'scatter', label: 'Scatter' },
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' },
  { id: 'dot', label: 'Dot' },
];

/** Key of a series in `ChartStyle` maps: the JSON of its value. */
export const seriesKey = (k: Cell) => JSON.stringify(k ?? null);

export function seriesColor(style: ChartStyle, key: string, index: number): string {
  return (
    style.seriesColors[key] ??
    (style.colorMode === 'palette' ? CATEGORICAL[index % CATEGORICAL.length]! : style.color)
  );
}

/** A series' name in the legend by default. */
export const seriesName = (s: PlotSeries) =>
  s.key === undefined || s.key === null ? '(none)' : String(s.key);

/** Series in display order: those in `order` first, the rest in category order. */
export function orderSeries(series: PlotSeries[], order: string[]): PlotSeries[] {
  if (!order.length) return series;
  const rank = new Map(order.map((k, i) => [k, i]));
  return series
    .map((s, i) => ({ s, r: rank.get(seriesKey(s.key)) ?? order.length + i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.s);
}

/** A chart value: 5 significant figures, exponential when very small or large. */
export function fmtChart(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  return a !== 0 && (a < 1e-3 || a >= 1e6) ? v.toExponential(3) : String(Number(v.toPrecision(5)));
}

/** A cell as chart text: numbers as `fmtChart`, missing as empty. */
export const cellText = (x: Cell) => (typeof x === 'number' ? fmtChart(x) : String(x ?? ''));

/** A sensible first chart: x = a numeric variable (else any), y = the first added statistic, series = a categorical variable. */
export function defaultPlot(columns: ColumnDef[], n: number): StatPlot {
  const vars = columns.filter((c) => c.kind === 'variable');
  const x =
    vars.find((c) => c.type === 'numeric') ?? vars[0] ?? columns.find((c) => c.key === 'sample:name')!;
  const stats = columns.filter((c) => c.kind === 'stat' || c.kind === 'derived');
  const y =
    stats.find((c) => c.kind === 'derived') ??
    stats.find((c) => !c.key.endsWith('|count') && !c.key.endsWith('|pctParent')) ??
    stats.find((c) => c.key.endsWith('|pctParent')) ??
    stats[0]!;
  const series = vars.find((c) => c.type === 'categorical' && c.key !== x.key);
  return {
    id: newId('sp_'),
    name: `Chart ${n + 1}`,
    kind: x.type === 'numeric' ? 'line' : 'bar',
    x: x.key,
    y: y.key,
    ...(series ? { series: series.key.slice(4) } : {}),
    xScale: 'linear',
    yScale: 'linear',
    error: 'sem',
    showPoints: true,
    hiddenPoints: [],
    excludeRows: [],
    style: structuredClone(DEFAULT_CHART_STYLE),
  };
}

/** Columns under the headings the axis pickers list them by. */
export function columnGroups(columns: ColumnDef[]): { title: string; cols: ColumnDef[] }[] {
  return [
    { title: 'Variables', cols: columns.filter((c) => c.kind === 'variable' || c.kind === 'sample') },
    { title: 'Statistics', cols: columns.filter((c) => c.kind === 'stat') },
    { title: 'Derived', cols: columns.filter((c) => c.kind === 'derived') },
  ].filter((g) => g.cols.length);
}

/** The chart's "CSV" export: one row per plotted point (series, x, mean, error, n). */
export function chartCsvRows(
  plot: StatPlot,
  summary: PlotSeries[],
  labels: { series: string | undefined; x: string; y: string },
): Cell[][] {
  const err = plot.error !== 'none';
  const header = [
    ...(labels.series ? [labels.series] : []),
    labels.x,
    `${labels.y} (mean)`,
    ...(err ? [`${CHART_ERRORS.find((e) => e.id === plot.error)!.label}`] : []),
    'n',
  ];
  const rows = summary.flatMap((s) =>
    s.points.map((p) => [
      ...(labels.series ? [plot.style.seriesLabels[seriesKey(s.key)] ?? s.key ?? ''] : []),
      p.x,
      p.mean,
      ...(err ? [p.err] : []),
      p.n,
    ]),
  );
  return [header, ...rows];
}
