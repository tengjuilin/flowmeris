import type { StatPlot } from '@flowmeris/model';
import type { PlotSeries } from '@flowmeris/table';
import { CHART_ERRORS, cellText, fmtChart, seriesKey } from '../../lib/chartStyle.ts';
import { DecimalCell, fracWidthOf } from './DecimalCell.tsx';

/** The plotted values under the chart, one row per point, in a collapsible box. */
export function ChartDataTable({
  plot,
  summary,
  seriesLabel,
  xLabel,
}: {
  plot: StatPlot;
  summary: PlotSeries[];
  seriesLabel: string | undefined;
  xLabel: string | undefined;
}) {
  const errLabel = CHART_ERRORS.find((e) => e.id === plot.error)!.label;
  const points = summary.flatMap((s) => s.points);
  const fracWidth = {
    x: fracWidthOf(points.flatMap((p) => (typeof p.x === 'number' ? [p.x] : []))),
    mean: fracWidthOf(points.map((p) => p.mean)),
    err: fracWidthOf(points.map((p) => p.err)),
  };
  return (
    <details className="chart-data">
      <summary>Data ({points.length} points)</summary>
      <div className="table-wrap">
        <table className="stats">
          <thead>
            <tr>
              {seriesLabel && <th>{seriesLabel}</th>}
              <th>{xLabel}</th>
              <th>Mean</th>
              {plot.error !== 'none' && <th>{errLabel}</th>}
              <th>n</th>
              <th>Values</th>
            </tr>
          </thead>
          <tbody>
            {summary.flatMap((s) =>
              s.points.map((p) => (
                <tr key={`${JSON.stringify(s.key ?? null)}${JSON.stringify(p.x)}`}>
                  {seriesLabel && (
                    <td className="text-cell">
                      {plot.style.seriesLabels[seriesKey(s.key)] ?? cellText(s.key)}
                    </td>
                  )}
                  {typeof p.x === 'number' ? (
                    <DecimalCell value={p.x} width={fracWidth.x} />
                  ) : (
                    <td className="text-cell">{cellText(p.x)}</td>
                  )}
                  <DecimalCell value={p.mean} width={fracWidth.mean} />
                  {plot.error !== 'none' && <DecimalCell value={p.err} width={fracWidth.err} />}
                  <td>{p.n}</td>
                  <td className="muted small text-cell">{p.values.map(fmtChart).join(', ')}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
