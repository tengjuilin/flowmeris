import { toCsv } from '@flowmeris/export';
import { type ChartStyle, type Group, type StatPlot, newId } from '@flowmeris/model';
import { summaryForPlot } from '@flowmeris/table';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useWidth } from '../../components/hooks/useWidth.ts';
import { type Anchor, PickerMenu } from '../../components/ui/PickerMenu.tsx';
import { includedRows, visiblePoints } from '../../lib/chartSelection.ts';
import {
  CHART_ERRORS,
  CHART_KINDS,
  cellText,
  chartCsvRows,
  defaultPlot,
  fmtChart,
  orderSeries,
  seriesKey,
} from '../../lib/chartStyle.ts';
import { download, safeName } from '../../lib/download.ts';
import { standaloneSvg, svgToPng } from '../../lib/export/svg.ts';
import { useAnalysisTable } from '../../state/hooks/stats.ts';
import { toast, useGroup, useStore } from '../../state/store.ts';
import { ChartInspector } from './ChartInspector.tsx';

import { Chart } from './Chart.tsx';
import { ColumnSelect, columnOptions } from './ColumnSelect.tsx';

export function ChartsView() {
  const group = useGroup();
  const variables = useStore((s) => s.ws.variables);
  const mutate = useStore((s) => s.mutate);
  const { perSample, levels, stats } = useAnalysisTable(group);
  const [chartId, setChartId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxRef, fitWidth] = useWidth();
  const [axisMenu, setAxisMenu] = useState<{ axis: 'x' | 'y'; anchor: Anchor } | null>(null);
  const closeAxisMenu = useCallback(() => setAxisMenu(null), []);

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

  if (!group) return <div className="empty">Select a group.</div>;
  const edit = (label: string, fn: (p: StatPlot) => void, merge?: string) =>
    mutate(
      label,
      (w) => {
        const g = w.groups.find((x) => x.id === group.id)!;
        const p = g.statPlots.find((x) => x.id === plot?.id);
        if (p) fn(p);
      },
      merge,
    );
  const editGroup = (label: string, fn: (g: Group) => void) =>
    mutate(label, (w) => fn(w.groups.find((x) => x.id === group.id)!));

  const addChart = (from?: StatPlot) => {
    const p = from
      ? { ...structuredClone(from), id: newId('sp_'), name: `${from.name} copy` }
      : defaultPlot(perSample.columns, group.statPlots.length);
    editGroup('Add chart', (g) => void g.statPlots.push(p));
    setChartId(p.id);
  };

  const tabs = (
    <div className="tab-strip chart-tabs" role="tablist" aria-label="Charts">
      {group.statPlots.map((p) => (
        <div key={p.id} className={`tab-strip-tab${p.id === plot?.id ? ' on' : ''}`}>
          <button type="button" role="tab" aria-selected={p.id === plot?.id} onClick={() => setChartId(p.id)}>
            {p.name}
          </button>
        </div>
      ))}
      <button type="button" className="tab-strip-add" onClick={() => addChart()} title="New chart">
        + Chart
      </button>
    </div>
  );

  if (!plot)
    return (
      <div className="charts-view">
        <div className="empty">
          <p>Plot statistics against sample variables — e.g. median fluorescence vs dose, by condition.</p>
          {variables.length === 0 && (
            <p className="muted">Tip: add variables such as dose or replicate in the Metadata tab first.</p>
          )}
          <button type="button" className="primary" onClick={() => addChart()}>
            + New chart
          </button>
        </div>
      </div>
    );

  const xCol = perSample.columns.find((c) => c.key === plot.x);
  const yCol = perSample.columns.find((c) => c.key === plot.y);
  const yOptions = perSample.columns.filter((c) => c.type === 'numeric' && c.kind !== 'sample');
  const catVars = variables.filter((v) => v.type === 'categorical');
  const band = plot.kind === 'bar' || plot.kind === 'dot' || xCol?.type === 'categorical';
  const seriesLabel = variables.find((v) => v.id === plot.series)?.name;
  const width = plot.style.width ?? fitWidth;
  const height = plot.style.height;

  const exportSvg = () => {
    if (!svgRef.current) return;
    download(`${safeName(`${group.name}_${plot.name}`)}.svg`, standaloneSvg(svgRef.current), 'image/svg+xml');
  };
  const exportPng = async () => {
    if (!svgRef.current) return;
    try {
      const png = await svgToPng(svgRef.current, 300);
      download(`${safeName(`${group.name}_${plot.name}`)}.png`, png, 'image/png');
    } catch (e) {
      toast(`PNG export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const errLabel = CHART_ERRORS.find((e) => e.id === plot.error)!.label;
  const exportCsv = () => {
    const rows = chartCsvRows(plot, summary, {
      series: seriesLabel,
      x: xCol?.label ?? plot.x,
      y: yCol?.label ?? plot.y,
    });
    download(`${safeName(`${group.name}_${plot.name}`)}_data.csv`, toCsv(rows), 'text/csv');
  };

  const style: ChartStyle = plot.style;
  return (
    <div className="charts-layout">
      <div className="charts-view">
        {tabs}
        <div className="toolbar chart-controls">
          <label className="field">
            Name
            <input
              type="text"
              value={plot.name}
              onChange={(e) =>
                edit('Rename chart', (p) => void (p.name = e.target.value), `chart-name:${plot.id}`)
              }
            />
          </label>
          <div className="seg">
            {CHART_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={plot.kind === k.id ? 'on' : ''}
                onClick={() => edit('Change chart type', (p) => void (p.kind = k.id))}
              >
                {k.label}
              </button>
            ))}
          </div>
          <ColumnSelect
            label="X"
            value={plot.x}
            columns={perSample.columns}
            onChange={(k) => edit('Change chart x', (p) => void (p.x = k))}
          />
          <ColumnSelect
            label="Y"
            value={plot.y}
            columns={yOptions}
            onChange={(k) => edit('Change chart y', (p) => void (p.y = k))}
          />
          <label className="field">
            Colour by
            <select
              value={plot.series ?? ''}
              onChange={(e) =>
                edit('Change chart series', (p) => {
                  p.series = e.target.value || undefined;
                  // Colours, labels and order are per value of the previous variable.
                  p.style.seriesColors = {};
                  p.style.seriesLabels = {};
                  p.style.seriesOrder = [];
                })
              }
            >
              <option value="">—</option>
              {catVars.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            X scale
            <select
              value={band ? 'linear' : plot.xScale}
              disabled={band}
              title={band ? 'Categories: no scale' : undefined}
              onChange={(e) =>
                edit('Change chart x scale', (p) => void (p.xScale = e.target.value as StatPlot['xScale']))
              }
            >
              <option value="linear">linear</option>
              <option value="log10">log</option>
            </select>
          </label>
          <label className="field">
            Y scale
            <select
              value={plot.yScale}
              onChange={(e) =>
                edit('Change chart y scale', (p) => void (p.yScale = e.target.value as StatPlot['yScale']))
              }
            >
              <option value="linear">linear</option>
              <option value="log10">log</option>
            </select>
          </label>
          <label
            className="field"
            title="Error bars over the replicates (rows) sharing an x value and colour"
          >
            Error
            <select
              value={plot.error}
              onChange={(e) =>
                edit('Change chart error bars', (p) => void (p.error = e.target.value as StatPlot['error']))
              }
            >
              {CHART_ERRORS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field check">
            <input
              type="checkbox"
              checked={plot.showPoints}
              onChange={(e) => edit('Toggle replicate points', (p) => void (p.showPoints = e.target.checked))}
            />
            Replicates
          </label>
        </div>
        <div className="toolbar chart-controls">
          {stats.busy > 0 && <span className="muted">computing… {stats.busy} sample(s) left</span>}
          <div className="spacer" />
          <div className="seg">
            <button type="button" onClick={exportSvg}>
              SVG
            </button>
            <button type="button" onClick={() => void exportPng()}>
              PNG
            </button>
            <button type="button" onClick={exportCsv} title="The plotted means, error and n">
              CSV
            </button>
          </div>
          <button type="button" onClick={() => addChart(plot)}>
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              editGroup(
                'Remove chart',
                (g) => void (g.statPlots = g.statPlots.filter((p) => p.id !== plot.id)),
              );
              setChartId(null);
            }}
          >
            Remove
          </button>
        </div>
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
              levels={levels}
              width={width}
              height={height}
              svgRef={svgRef}
              onPickAxis={(axis, anchor) => setAxisMenu({ axis, anchor })}
            />
          )}
          {axisMenu && (
            <PickerMenu
              anchor={axisMenu.anchor}
              title={`${axisMenu.axis.toUpperCase()} axis`}
              options={columnOptions(axisMenu.axis === 'x' ? perSample.columns : yOptions)}
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
        <details className="chart-data">
          <summary>Data ({summary.reduce((a, s) => a + s.points.length, 0)} points)</summary>
          <div className="table-wrap">
            <table className="stats">
              <thead>
                <tr>
                  {seriesLabel && <th>{seriesLabel}</th>}
                  <th>{xCol?.label}</th>
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
                          {style.seriesLabels[seriesKey(s.key)] ?? cellText(s.key)}
                        </td>
                      )}
                      <td className={typeof p.x === 'number' ? undefined : 'text-cell'}>{cellText(p.x)}</td>
                      <td>{fmtChart(p.mean)}</td>
                      {plot.error !== 'none' && <td>{fmtChart(p.err)}</td>}
                      <td>{p.n}</td>
                      <td className="muted small text-cell">{p.values.map(fmtChart).join(', ')}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </details>
      </div>
      <ChartInspector
        plot={plot}
        series={allSeries}
        rowNames={rowNames}
        seriesLabel={seriesLabel}
        xTitle={xCol?.label ?? plot.x}
        yTitle={yCol?.label ?? plot.y}
        band={band}
        edit={edit}
      />
    </div>
  );
}
