import { toCsv } from '@flowmeris/export';
import { useCallback, useRef, useState } from 'react';
import { ExportMenu } from '../../components/controls/ExportMenu.tsx';
import { useWidth } from '../../components/hooks/useWidth.ts';
import { type Anchor, PickerMenu } from '../../components/ui/PickerMenu.tsx';
import { TabStrip } from '../../components/ui/TabStrip.tsx';
import { chartCsvRows, defaultPlot, seriesKey } from '../../lib/chartStyle.ts';
import { download, safeName } from '../../lib/download.ts';
import { svgFigure } from '../../lib/export/index.ts';
import { addChart, removeChart } from '../../state/commands/charts.ts';
import { useStore } from '../../state/store.ts';
import { Chart } from './Chart.tsx';
import { ChartDataTable } from './ChartDataTable.tsx';
import { ChartGroupsPanel } from './ChartGroupsPanel.tsx';
import { columnOptions } from './ColumnSelect.tsx';
import { useChart } from './useChart.ts';

/** The Charts view: the group's charts in tabs, the open chart and its data, and a side column with the
 * Export and Groups cards. Its settings panel is `ChartInspector`. */
export function ChartsView() {
  const c = useChart();
  const { group, plot, columns, summary, allSeries, xCol, yCol, seriesLabel, edit } = c;
  const setUi = useStore((s) => s.setUi);
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxRef, fitWidth] = useWidth();
  const [axisMenu, setAxisMenu] = useState<{ axis: 'x' | 'y'; anchor: Anchor } | null>(null);
  const closeAxisMenu = useCallback(() => setAxisMenu(null), []);

  if (!group) return <div className="empty">Select a group.</div>;
  const newChart = () => addChart(group.id, defaultPlot(columns, group.statPlots.length));

  if (!plot)
    return (
      <div className="charts-view">
        <div className="empty">
          <p>Plot statistics against sample variables — e.g. median fluorescence vs dose, by condition.</p>
          {c.variables.length === 0 && (
            <p className="muted">Tip: add variables such as dose or replicate in the Metadata tab first.</p>
          )}
          <button type="button" className="primary" onClick={newChart}>
            + New chart
          </button>
        </div>
      </div>
    );

  const baseName = `${group.name}_${plot.name}`;
  const exportCsv = () => {
    const rows = chartCsvRows(plot, summary, {
      series: seriesLabel,
      x: xCol?.label ?? plot.x,
      y: yCol?.label ?? plot.y,
    });
    download(`${safeName(baseName)}_data.csv`, toCsv(rows), 'text/csv');
  };

  return (
    <div className="plot-layout">
      <div className="charts-view">
        <TabStrip
          className="chart-tabs"
          label="Charts"
          tabs={group.statPlots.map((p) => ({ id: p.id, label: p.name }))}
          current={plot.id}
          onSelect={(id) => setUi({ chartId: id })}
          onClose={(id) => removeChart(group.id, id)}
          closeLabel="Delete chart"
          onAdd={newChart}
          addLabel="New chart"
        />
        {c.stats.busy > 0 && <p className="muted small">computing… {c.stats.busy} sample(s) left</p>}
        <div ref={boxRef} className="chart-wrap">
          {!xCol || !yCol ? (
            <div className="plot-message">Choose the {!xCol ? 'x' : 'y'} column.</div>
          ) : (
            <Chart
              plot={plot}
              series={summary}
              colorIndex={new Map(allSeries.map((s, i) => [seriesKey(s.key), i]))}
              xCol={xCol}
              yCol={yCol}
              seriesLabel={seriesLabel}
              levels={c.levels}
              width={plot.style.width ?? fitWidth}
              height={plot.style.height}
              svgRef={svgRef}
              onPickAxis={(axis, anchor) => setAxisMenu({ axis, anchor })}
            />
          )}
          {axisMenu && (
            <PickerMenu
              anchor={axisMenu.anchor}
              title={`${axisMenu.axis.toUpperCase()} axis`}
              options={columnOptions(axisMenu.axis === 'x' ? columns : c.yOptions)}
              value={plot[axisMenu.axis]}
              onPick={(k) =>
                axisMenu.axis === 'x'
                  ? edit('Change chart x', (p) => void (p.x = k))
                  : edit('Change chart y', (p) => void (p.y = k))
              }
              onClose={closeAxisMenu}
            />
          )}
        </div>
        <ChartDataTable plot={plot} summary={summary} seriesLabel={seriesLabel} xLabel={xCol?.label} />
      </div>
      <div className="plot-side">
        <ExportMenu
          className="side-export"
          disabled={!xCol || !yCol}
          target={() => (svgRef.current ? { figure: svgFigure(svgRef.current), name: baseName } : undefined)}
          csv={{ label: 'CSV (plotted data)', write: exportCsv }}
        />
        <ChartGroupsPanel chart={c} />
      </div>
    </div>
  );
}
