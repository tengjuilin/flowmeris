import type { ChartStyle, StatPlot } from '@flowmeris/model';
import { summaryForPlot } from '@flowmeris/table';
import { useMemo } from 'react';
import { includedRows, visiblePoints } from '../../lib/chartSelection.ts';
import { cellText, orderSeries } from '../../lib/chartStyle.ts';
import { editChart } from '../../state/commands/charts.ts';
import { useAnalysisTable } from '../../state/hooks/stats.ts';
import { useGroup, useStore } from '../../state/store.ts';

export type ChartData = ReturnType<typeof useChart>;

/**
 * The Charts view's open chart (`ui.chartId`, else the group's first) with its data and edits; shared by
 * the view, its Groups card and its settings panel.
 */
export function useChart() {
  const group = useGroup();
  const chartId = useStore((s) => s.ui.chartId);
  const variables = useStore((s) => s.ws.variables);
  const { perSample, levels, stats } = useAnalysisTable(group);
  const plot = group?.statPlots.find((p) => p.id === chartId) ?? group?.statPlots[0];
  const seriesCol = plot?.series ? `var:${plot.series}` : undefined;
  // `allSeries` has every point with all its rows, for the Groups list; `summary` is what is plotted.
  const { allSeries, summary } = useMemo(() => {
    if (!plot) return { allSeries: [], summary: [] };
    const sum = (rows: typeof perSample.rows) =>
      orderSeries(
        summaryForPlot(rows, plot.x, plot.y, seriesCol, plot.error, levels),
        plot.style.seriesOrder,
      );
    const allSeries = sum(perSample.rows);
    const kept = includedRows(perSample.rows, plot.excludeRows);
    return {
      allSeries,
      summary: visiblePoints(kept === perSample.rows ? allSeries : sum(kept), plot.hiddenPoints),
    };
  }, [plot, perSample, seriesCol, levels]);
  const rowNames = useMemo(
    () => Object.fromEntries(perSample.rows.map((r) => [r.id, cellText(r.values['sample:name'])])),
    [perSample],
  );

  const columns = perSample.columns;
  const xCol = plot && columns.find((c) => c.key === plot.x);
  const yCol = plot && columns.find((c) => c.key === plot.y);
  /** Whether x is placed as categories. */
  const band = !!plot && (plot.kind === 'bar' || plot.kind === 'dot' || xCol?.type === 'categorical');

  /** Edit the open chart; edits with the same `merge` key fold into one undo step. */
  const edit = (label: string, fn: (p: StatPlot) => void, merge?: string) => {
    if (group && plot) editChart(group.id, plot.id, label, fn, merge);
  };
  /**
   * Set style `key` of the open chart (unset when `value` is undefined). Edits of one key, such as typing a
   * number, fold into one undo step unless `merge` says otherwise.
   */
  const set = <K extends keyof ChartStyle>(key: K, value: ChartStyle[K], label: string, merge?: string) =>
    edit(
      label,
      (p) => {
        if (value === undefined) delete p.style[key];
        else p.style[key] = value;
      },
      `chart:${plot?.id}:${merge ?? `style:${key}`}`,
    );

  return {
    group,
    plot,
    variables,
    columns,
    /** Columns a chart can plot on y: the numeric ones, other than sample identity. */
    yOptions: columns.filter((c) => c.type === 'numeric' && c.kind !== 'sample'),
    levels,
    stats,
    allSeries,
    summary,
    rowNames,
    xCol,
    yCol,
    band,
    seriesLabel: variables.find((v) => v.id === plot?.series)?.name,
    edit,
    set,
  };
}
