import { toCsv } from '@flowmeris/export';
import { type ChartStyle, type Group, type StatPlot, newId } from '@flowmeris/model';
import {
  type Cell,
  type ColumnDef,
  type LevelOrder,
  type PlotPoint,
  type PlotSeries,
  compareCells,
  summaryForPlot,
} from '@flowmeris/table';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { type Axis, barPath, makeAxis, validFix } from '../lib/chartAxis.ts';
import { includedRows, visiblePoints } from '../lib/chartSelection.ts';
import {
  CHART_ERRORS,
  CHART_KINDS,
  cellText,
  chartCsvRows,
  columnGroups,
  defaultPlot,
  fmtChart,
  orderSeries,
  seriesColor,
  seriesKey,
} from '../lib/chartStyle.ts';
import { download, safeName } from '../lib/download.ts';
import { standaloneSvg } from '../lib/export/svg.ts';
import { FONT_STACKS } from '../lib/figure.ts';
import { useAnalysisTable } from '../state/hooks/stats.ts';
import { toast, useGroup, useStore } from '../state/store.ts';
import { ChartInspector } from './ChartInspector.tsx';
import { useWidth } from './hooks/useWidth.ts';
import { type Anchor, type PickOption, PickerMenu, pickerTrigger } from './ui/PickerMenu.tsx';
import { SupLabel } from './ui/SupLabel.tsx';

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

interface Hover {
  x: number;
  y: number;
  series: Cell;
  point: PlotPoint;
}

/** Rough width of text in px (no layout pass needed). */
const textW = (s: string, size: number) => s.length * size * 0.6;

function Chart(props: {
  plot: StatPlot;
  /** Series in display order. */
  series: PlotSeries[];
  /** Palette index of each series key among all series, so hiding one keeps the others' colours. */
  colorIndex: Map<string, number>;
  xCol: ColumnDef;
  yCol: ColumnDef;
  seriesLabel: string | undefined;
  levels: LevelOrder;
  width: number;
  height: number;
  svgRef: React.RefObject<SVGSVGElement>;
  /** Clicking an axis title opens a picker for that axis's column here. */
  onPickAxis: (axis: 'x' | 'y', anchor: Anchor) => void;
}) {
  const { plot, series, xCol, yCol, width } = props;
  const axisTitle = (axis: 'x' | 'y', text: string) => ({
    className: 'axis-title pickable',
    ...pickerTrigger(`${axis.toUpperCase()} axis: ${text}. Change column`, (a) => props.onPickAxis(axis, a)),
  });
  const st = plot.style;
  const [hover, setHover] = useState<Hover | null>(null);
  const clipId = `chart-clip-${useId().replace(/:/g, '')}`;
  const band = plot.kind === 'bar' || plot.kind === 'dot' || xCol.type === 'categorical';
  const xLog = !band && plot.xScale === 'log10';
  const yLog = plot.yScale === 'log10';
  const multi = series.length > 1;
  const color = (i: number) => {
    const k = seriesKey(series[i]?.key);
    return seriesColor(st, k, props.colorIndex.get(k) ?? i);
  };
  const nameOf = (s: PlotSeries) => st.seriesLabels[seriesKey(s.key)] ?? (cellText(s.key) || '(none)');

  // Categories of a band axis, in display order.
  const cats = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const s of series) for (const p of s.points) m.set(JSON.stringify(p.x), p.x);
    return [...m.values()].sort((a, b) => compareCells(a, b, props.levels(plot.x)));
  }, [series, plot.x, props.levels]);

  // Value extents, dropping non-positive values on log axes.
  const okY = (v: number) => Number.isFinite(v) && (!yLog || v > 0);
  const okX = (v: number) => Number.isFinite(v) && (!xLog || v > 0);
  let yMin = Infinity;
  let yMax = -Infinity;
  let xMin = Infinity;
  let xMax = -Infinity;
  let dropped = 0;
  for (const s of series)
    for (const p of s.points) {
      const vals = [
        p.mean,
        ...(Number.isFinite(p.err) ? [p.mean - p.err, p.mean + p.err] : []),
        ...(plot.showPoints ? p.values : []),
      ];
      for (const v of vals)
        if (okY(v)) {
          yMin = Math.min(yMin, v);
          yMax = Math.max(yMax, v);
        }
      if (!okY(p.mean)) dropped++;
      if (!band && typeof p.x === 'number') {
        if (okX(p.x)) {
          xMin = Math.min(xMin, p.x);
          xMax = Math.max(xMax, p.x);
        } else dropped++;
      }
    }
  if (!Number.isFinite(yMin))
    return <div className="plot-message">No {yLog ? 'positive ' : ''}values to plot.</div>;
  if (!band && !Number.isFinite(xMin))
    return <div className="plot-message">No {xLog ? 'positive ' : ''}x values to plot.</div>;

  const xFix = band ? {} : validFix(st.xMin, st.xMax, xLog);
  const yFix = validFix(st.yMin, st.yMax, yLog);
  const yAxisAt = (p0: number, p1: number) =>
    makeAxis(yMin, yMax, p0, p1, { log: yLog, zero: plot.kind === 'bar', fix: yFix, ticks: st.yTicks });

  // Margins from the text they hold.
  const fs = st.tickFontSize;
  const ts = st.titleFontSize;
  const ls = st.legendFontSize;
  const xTitle = (plot.xLabel ?? xCol.label).trim();
  const yTitle = (plot.yLabel ?? yCol.label).trim();
  const legend = multi ? st.legend : 'none';
  const H = props.height;
  const legendW = legend === 'right' ? 24 + Math.max(...series.map((s) => textW(nameOf(s), ls))) : 0;
  const yLabelW = st.showTickLabels ? Math.max(0, ...yAxisAt(0, 1).ticks.map((t) => textW(t.label, fs))) : 0;
  const m = {
    l: 14 + (yTitle ? ts + 8 : 0) + yLabelW + 8,
    r: 20 + legendW,
    t: 14 + (legend === 'top' ? ls + 14 : 0),
    b: (st.showTickLabels ? fs + 10 : 6) + (xTitle ? ts + 18 : 6),
  };
  const bandW = band ? (width - m.l - m.r) / Math.max(1, cats.length) : 0;
  const longest = Math.max(0, ...cats.map((c) => cellText(c).length));
  const rotate = band && st.showTickLabels && longest * fs * 0.6 > bandW - 6;
  if (rotate) m.b = Math.min(H * 0.45, 18 + longest * fs * 0.47 + (xTitle ? ts + 6 : 0));
  const pw = Math.max(80, width - m.l - m.r);
  const ph = Math.max(40, H - m.t - m.b);

  const y = yAxisAt(m.t + ph, m.t);
  const x: Axis | undefined = band
    ? undefined
    : makeAxis(xMin, xMax, m.l, m.l + pw, { log: xLog, zero: false, fix: xFix, ticks: st.xTicks });
  const clip = band
    ? yFix.min !== undefined || yFix.max !== undefined
    : [xFix.min, xFix.max, yFix.min, yFix.max].some((v) => v !== undefined);

  // Horizontal position of series i at category/x value.
  const slotGap = band && plot.kind === 'bar' ? 2 : 4;
  const slot = !band
    ? 0
    : st.barWidth === undefined
      ? Math.min(24, (bandW * 0.8) / series.length)
      : Math.max(1, (bandW * st.barWidth - (series.length - 1) * slotGap) / series.length);
  const groupW = series.length * slot + (series.length - 1) * slotGap;
  const px = (xv: Cell, i: number): number => {
    if (band) {
      const c = cats.findIndex((k) => JSON.stringify(k) === JSON.stringify(xv));
      return m.l + bandW * (c + 0.5) - groupW / 2 + i * (slot + slotGap) + slot / 2;
    }
    return x!.map(xv as number);
  };
  const yClamp = (v: number) => (yLog && v <= 0 ? m.t + ph : Math.max(m.t, Math.min(m.t + ph, y.map(v))));
  const base = plot.kind === 'bar' ? (yLog ? m.t + ph : y.map(Math.max(y.lo, Math.min(0, y.hi)))) : 0;
  const capW = st.capWidth ?? (band ? Math.max(6, Math.min(12, slot * 0.6)) : 10);
  const pointOpacity = st.pointOpacity ?? (plot.kind === 'bar' ? 0.85 : 0.55);
  const tickText = { fontSize: fs };

  return (
    <div className="chart-box" onPointerLeave={() => setHover(null)}>
      <svg
        ref={props.svgRef}
        className="stat-chart"
        width={width}
        height={H}
        role="img"
        aria-label={`${yTitle || yCol.label} by ${xTitle || xCol.label}${props.seriesLabel ? ` and ${props.seriesLabel}` : ''}`}
        style={{ fontFamily: FONT_STACKS[st.fontFamily] }}
      >
        {clip && (
          <defs>
            <clipPath id={clipId}>
              <rect x={m.l} y={m.t} width={pw} height={ph} />
            </clipPath>
          </defs>
        )}
        <rect className="chart-bg" x={0} y={0} width={width} height={H} />
        {/* Gridlines and y axis */}
        <g className="chart-axis">
          {y.ticks.map((t, i) => (
            <g key={i}>
              {st.showGrid && t.major && (
                <line className="chart-grid" x1={m.l} x2={m.l + pw} y1={t.pos} y2={t.pos} />
              )}
              <line x1={m.l - (t.major ? 5 : 3)} x2={m.l} y1={t.pos} y2={t.pos} />
              {st.showTickLabels && t.label && (
                <text x={m.l - 8} y={t.pos} textAnchor="end" dominantBaseline="middle" style={tickText}>
                  <SupLabel label={t.label} fontSize={fs} />
                </text>
              )}
            </g>
          ))}
          <line x1={m.l} x2={m.l} y1={m.t} y2={m.t + ph} />
          <line x1={m.l} x2={m.l + pw} y1={m.t + ph} y2={m.t + ph} />
          {band
            ? cats.map((c, i) => {
                const cx = m.l + bandW * (i + 0.5);
                return (
                  <g key={i}>
                    <line x1={cx} x2={cx} y1={m.t + ph} y2={m.t + ph + 4} />
                    {st.showTickLabels && (
                      <text
                        x={cx}
                        y={m.t + ph + fs + 5}
                        textAnchor={rotate ? 'end' : 'middle'}
                        transform={rotate ? `rotate(-40 ${cx} ${m.t + ph + fs + 1})` : undefined}
                        style={tickText}
                      >
                        {cellText(c)}
                      </text>
                    )}
                  </g>
                );
              })
            : x!.ticks.map((t, i) => (
                <g key={i}>
                  <line x1={t.pos} x2={t.pos} y1={m.t + ph} y2={m.t + ph + (t.major ? 5 : 3)} />
                  {st.showTickLabels && t.label && (
                    <text x={t.pos} y={m.t + ph + fs + 7} textAnchor="middle" style={tickText}>
                      <SupLabel label={t.label} fontSize={fs} />
                    </text>
                  )}
                </g>
              ))}
          {xTitle && (
            <text
              {...axisTitle('x', xTitle)}
              x={m.l + pw / 2}
              y={H - 8}
              textAnchor="middle"
              style={{ fontSize: ts }}
            >
              {xTitle}
            </text>
          )}
          {yTitle && (
            <text
              {...axisTitle('y', yTitle)}
              x={6 + ts * 0.8}
              y={m.t + ph / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${6 + ts * 0.8} ${m.t + ph / 2})`}
              style={{ fontSize: ts }}
            >
              {yTitle}
            </text>
          )}
        </g>
        {/* Marks, one group per series */}
        <g clipPath={clip ? `url(#${clipId})` : undefined}>
          {series.map((s, i) => {
            const c = color(i);
            const pts = s.points.filter((p) => okY(p.mean) && (band || okX(p.x as number)));
            return (
              <g key={seriesKey(s.key)}>
                {plot.kind === 'bar' &&
                  pts.map((p) => (
                    <path
                      key={JSON.stringify(p.x)}
                      d={barPath(px(p.x, i) - slot / 2, slot, base, yClamp(p.mean), 4)}
                      fill={c}
                      fillOpacity={st.fillOpacity}
                    />
                  ))}
                {plot.kind === 'line' && pts.length > 1 && st.lineWidth > 0 && (
                  <polyline
                    points={pts.map((p) => `${px(p.x, i)},${y.map(p.mean)}`).join(' ')}
                    fill="none"
                    stroke={c}
                    strokeWidth={st.lineWidth}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {plot.error !== 'none' &&
                  st.errorWidth > 0 &&
                  pts.map((p) => {
                    if (!Number.isFinite(p.err)) return null;
                    const cx = px(p.x, i);
                    const lw = { strokeWidth: st.errorWidth };
                    return (
                      <g key={`e${JSON.stringify(p.x)}`} className="chart-err">
                        <line
                          x1={cx}
                          x2={cx}
                          y1={yClamp(p.mean - p.err)}
                          y2={yClamp(p.mean + p.err)}
                          style={lw}
                        />
                        {capW > 0 && (
                          <>
                            <line
                              x1={cx - capW / 2}
                              x2={cx + capW / 2}
                              y1={yClamp(p.mean + p.err)}
                              y2={yClamp(p.mean + p.err)}
                              style={lw}
                            />
                            <line
                              x1={cx - capW / 2}
                              x2={cx + capW / 2}
                              y1={yClamp(p.mean - p.err)}
                              y2={yClamp(p.mean - p.err)}
                              style={lw}
                            />
                          </>
                        )}
                      </g>
                    );
                  })}
                {plot.showPoints &&
                  st.pointSize > 0 &&
                  pts.flatMap((p) =>
                    p.values.filter(okY).map((v, j) => {
                      const spread = band ? Math.max(0, slot * 0.7) : 0;
                      const dx = p.values.length > 1 ? (j / (p.values.length - 1) - 0.5) * spread : 0;
                      return (
                        <circle
                          key={`r${JSON.stringify(p.x)}${j}`}
                          className="chart-rep"
                          cx={px(p.x, i) + dx}
                          cy={y.map(v)}
                          r={st.pointSize}
                          fill={plot.kind === 'bar' ? 'var(--surface)' : c}
                          stroke={plot.kind === 'bar' ? 'var(--text)' : 'var(--surface)'}
                          strokeWidth={plot.kind === 'bar' ? 1 : 1.5}
                          opacity={pointOpacity}
                        />
                      );
                    }),
                  )}
                {plot.kind !== 'bar' &&
                  st.markerSize > 0 &&
                  pts.map((p) => (
                    <circle
                      key={`m${JSON.stringify(p.x)}`}
                      cx={px(p.x, i)}
                      cy={y.map(p.mean)}
                      r={st.markerSize}
                      fill={c}
                      fillOpacity={st.fillOpacity}
                      stroke="var(--surface)"
                      strokeWidth={Math.min(2, st.markerSize / 2)}
                    />
                  ))}
                {/* Hit targets larger than the marks */}
                {pts.map((p) => (
                  <rect
                    key={`h${JSON.stringify(p.x)}`}
                    className="chart-hit"
                    x={px(p.x, i) - Math.max(10, slot / 2 + 2)}
                    y={plot.kind === 'bar' ? Math.min(base, yClamp(p.mean)) - 8 : yClamp(p.mean) - 12}
                    width={Math.max(20, slot + 4)}
                    height={plot.kind === 'bar' ? Math.abs(base - yClamp(p.mean)) + 16 : 24}
                    onPointerEnter={() =>
                      setHover({ x: px(p.x, i), y: yClamp(p.mean), series: s.key, point: p })
                    }
                  />
                ))}
              </g>
            );
          })}
        </g>
        {legend !== 'none' && (
          <g
            className="chart-legend"
            transform={
              legend === 'top'
                ? `translate(${m.l}, ${8 + ls / 2})`
                : `translate(${m.l + pw + 16}, ${m.t + ls / 2})`
            }
          >
            {(() => {
              let off = 0;
              const sw = Math.round(ls * 0.85);
              return series.map((s, i) => {
                const label = nameOf(s);
                const g = (
                  <g
                    key={seriesKey(s.key)}
                    transform={legend === 'top' ? `translate(${off}, 0)` : `translate(0, ${i * (ls + 8)})`}
                  >
                    <rect
                      x={0}
                      y={-sw / 2}
                      width={sw}
                      height={sw}
                      rx={2}
                      fill={color(i)}
                      fillOpacity={st.fillOpacity}
                    />
                    <text x={sw + 5} y={0} dominantBaseline="middle" style={{ fontSize: ls }}>
                      {label}
                    </text>
                  </g>
                );
                off += sw + 18 + textW(label, ls);
                return g;
              });
            })()}
          </g>
        )}
      </svg>
      {hover && (
        <div
          className="chart-tip"
          style={{ left: Math.min(hover.x + 12, width - 200), top: Math.max(0, hover.y - 64) }}
        >
          {props.seriesLabel && multi && (
            <div>
              <span
                className="swatch"
                style={{ background: color(series.findIndex((s) => s.key === hover.series)) }}
              />{' '}
              {props.seriesLabel}: {nameOf(series.find((s) => s.key === hover.series)!)}
            </div>
          )}
          <div>
            {xCol.label}: <strong>{cellText(hover.point.x)}</strong>
          </div>
          <div>
            {plot.error === 'none' || !Number.isFinite(hover.point.err) ? (
              <>mean {fmtChart(hover.point.mean)}</>
            ) : (
              <>
                mean {fmtChart(hover.point.mean)} ± {fmtChart(hover.point.err)} (
                {CHART_ERRORS.find((e) => e.id === plot.error)?.label})
              </>
            )}
          </div>
          <div className="muted">n = {hover.point.n}</div>
        </div>
      )}
      {dropped > 0 && (
        <p className="plot-note">
          {dropped} point(s) not shown (non-positive on a log axis, or not a number).
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

function svgToPng(svg: string, w: number, h: number, scale: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Could not render the SVG'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function columnOptions(columns: ColumnDef[]): PickOption[] {
  return columnGroups(columns).flatMap((g) =>
    g.cols.map((c) => ({ value: c.key, label: c.label, group: g.title })),
  );
}

function ColumnSelect(props: {
  label: string;
  value: string;
  columns: ColumnDef[];
  onChange: (key: string) => void;
}) {
  const groups = columnGroups(props.columns);
  const known = props.columns.some((c) => c.key === props.value);
  return (
    <label className="field">
      {props.label}
      <select value={known ? props.value : ''} onChange={(e) => props.onChange(e.target.value)}>
        {!known && <option value="">(missing column)</option>}
        {groups.map((g) => (
          <optgroup key={g.title} label={g.title}>
            {g.cols.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

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
      const blob = await svgToPng(standaloneSvg(svgRef.current), width, height, 300 / 96);
      download(`${safeName(`${group.name}_${plot.name}`)}.png`, blob, 'image/png');
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
