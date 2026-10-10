import { GroupPicker, toggleIds } from '../../components/ui/GroupPicker.tsx';
import { pointKey } from '../../lib/chartSelection.ts';
import { seriesKey } from '../../lib/chartStyle.ts';
import type { ChartData } from './useChart.ts';

/**
 * Card beside the chart: the plotted points (the samples sharing an x value and colour), to hide a point or
 * leave single replicates out of its mean and error bar.
 */
export function ChartGroupsPanel({ chart }: { chart: ChartData }) {
  const { plot, allSeries, seriesLabel, rowNames, edit } = chart;
  if (!plot) return null;
  return (
    <section className="chart-groups" aria-label="Groups">
      <div className="pane-title">Groups</div>
      <p className="muted small">
        Click a group to hide it; open it with ▸ to leave single replicates out of its mean and error bar.
        Shift-click selects a range.
      </p>
      <GroupPicker
        groups={allSeries.flatMap((s) => {
          const name =
            plot.style.seriesLabels[seriesKey(s.key)] ??
            (s.key === undefined || s.key === null ? '(none)' : String(s.key));
          return s.points.map((p) => ({
            id: pointKey(s.key, p.x),
            label: seriesLabel ? `${name} · ${String(p.x)}` : String(p.x),
            members: p.rowIds.map((id) => ({ id, label: rowNames[id] ?? id })),
          }));
        })}
        hidden={new Set(plot.hiddenPoints)}
        excluded={new Set(plot.excludeRows)}
        onShow={(ids, on) =>
          edit(on ? 'Show chart group' : 'Hide chart group', (p) => {
            p.hiddenPoints = toggleIds(p.hiddenPoints, ids, !on);
          })
        }
        onInclude={(ids, on) =>
          edit(on ? 'Include replicate' : 'Exclude replicate', (p) => {
            p.excludeRows = toggleIds(p.excludeRows, ids, !on);
          })
        }
        onShowAll={() =>
          edit('Show all chart groups', (p) => {
            p.hiddenPoints = [];
            p.excludeRows = [];
          })
        }
      />
    </section>
  );
}
