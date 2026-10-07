import { toCsv } from '@flowmeris/export';
import { type Group, type StatPlot, newId } from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import {
  type Cell,
  type ColumnDef,
  type LevelOrder,
  type PlotPoint,
  type PlotSeries,
  compareCells,
  summaryForPlot,
} from '@flowmeris/table';
import { formatLinear, formatPow10, niceLinearTicks } from '@flowmeris/transforms';
import { useEffect, useMemo, useRef, useState } from 'react';
import { download, safeName } from '../lib/download.ts';
import { standaloneSvg } from '../lib/exportPlot.ts';
import { useAnalysisTable } from '../lib/statsTable.ts';
import { toast, useGroup, useStore } from '../state/store.ts';

const ERRORS: { id: StatPlot['error']; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'sd', label: 'SD' },
  { id: 'sem', label: 'SEM' },
  { id: 'ci95', label: '95% CI' },
];

const KINDS: { id: StatPlot['kind']; label: string }[] = [
  { id: 'scatter', label: 'Scatter' },
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' },
  { id: 'dot', label: 'Dot' },
];

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  return a !== 0 && (a < 1e-3 || a >= 1e6) ? v.toExponential(3) : String(Number(v.toPrecision(5)));
}

const cellText = (x: Cell) => (typeof x === 'number' ? fmt(x) : String(x ?? ''));

/** A sensible first chart: x = a numeric variable (else any), y = the first added statistic, series = a categorical variable. */
function defaultPlot(columns: ColumnDef[], n: number): StatPlot {
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
  };
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

interface Axis {
  /** Data value → px. */
  map: (v: number) => number;
  ticks: { pos: number; label: string; major: boolean }[];
  lo: number;
  hi: number;
}

function linearAxis(lo: number, hi: number, p0: number, p1: number, zero: boolean): Axis {
  let a = zero ? Math.min(0, lo) : lo;
  let b = zero ? Math.max(0, hi) : hi;
  if (!(b > a)) {
    const d = Math.abs(a) * 0.1 || 1;
    a -= d;
    b += d;
  }
  const pad = (b - a) * 0.05;
  if (!(zero && a === 0)) a -= pad;
  if (!(zero && b === 0)) b += pad;
  const t = niceLinearTicks(a, b, 6);
  a = Math.min(a, t[0]!);
  b = Math.max(b, t[t.length - 1]!);
  const map = (v: number) => p0 + ((v - a) / (b - a)) * (p1 - p0);
  return { map, lo: a, hi: b, ticks: t.map((v) => ({ pos: map(v), label: formatLinear(v), major: true })) };
}

function logAxis(lo: number, hi: number, p0: number, p1: number): Axis {
  let a = Math.log10(lo);
  let b = Math.log10(hi);
  if (!(b > a)) {
    a -= 0.5;
    b += 0.5;
  }
  const pad = (b - a) * 0.05;
  a -= pad;
  b += pad;
  const map = (v: number) => p0 + ((Math.log10(v) - a) / (b - a)) * (p1 - p0);
  const ticks: Axis['ticks'] = [];
  const decades = b - a;
  for (let k = Math.floor(a); k <= Math.ceil(b); k++)
    for (let m = 1; m <= 9; m++) {
      const v = m * 10 ** k;
      const l = Math.log10(v);
      if (l < a || l > b) continue;
      const major = m === 1;
      const label = major ? formatPow10(1, k) : decades < 1.5 && (m === 2 || m === 5) ? formatLinear(v) : '';
      ticks.push({ pos: map(v), label, major });
    }
  if (!ticks.some((t) => t.label)) {
    // Less than a decade with no 1/2/5 multiple inside: label the ends.
    for (const v of [10 ** a, 10 ** b])
      ticks.push({ pos: map(v), label: formatLinear(Number(v.toPrecision(2))), major: true });
  }
  return { map, lo: 10 ** a, hi: 10 ** b, ticks };
}

/** Bar path with a rounded data end (r px) and a square baseline end. */
function barPath(x: number, w: number, yBase: number, yVal: number, r: number): string {
  const up = yVal < yBase;
  const h = Math.abs(yBase - yVal);
  const rr = Math.min(r, w / 2, h);
  if (up)
    return `M${x},${yBase}V${yVal + rr}Q${x},${yVal} ${x + rr},${yVal}H${x + w - rr}Q${x + w},${yVal} ${x + w},${yVal + rr}V${yBase}Z`;
  return `M${x},${yBase}V${yVal - rr}Q${x},${yVal} ${x + rr},${yVal}H${x + w - rr}Q${x + w},${yVal} ${x + w},${yVal - rr}V${yBase}Z`;
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

interface Hover {
  x: number;
  y: number;
  series: Cell;
  point: PlotPoint;
}

function Chart(props: {
  plot: StatPlot;
  series: PlotSeries[];
  xCol: ColumnDef;
  yCol: ColumnDef;
  seriesLabel: string | undefined;
  levels: LevelOrder;
  width: number;
  svgRef: React.RefObject<SVGSVGElement>;
}) {
  const { plot, series, xCol, yCol, width } = props;
  const [hover, setHover] = useState<Hover | null>(null);
  const band = plot.kind === 'bar' || plot.kind === 'dot' || xCol.type === 'categorical';
  const xLog = !band && plot.xScale === 'log10';
  const yLog = plot.yScale === 'log10';
  const multi = series.length > 1;
  const color = (i: number) => CATEGORICAL[Math.min(i, CATEGORICAL.length - 1)]!;

  // Categories of a band axis, in display order.
  const cats = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const s of series) for (const p of s.points) m.set(JSON.stringify(p.x), p.x);
    return [...m.values()].sort((a, b) => compareCells(a, b, props.levels(plot.x)));
  }, [series, plot.x, props.levels]);

  const longest = Math.max(0, ...cats.map((c) => cellText(c).length));
  const H = 440;
  const legendH = multi ? 26 : 0;
  const m = { l: 72, r: 20, t: 14 + legendH, b: 56 };
  const bandW = band ? (width - m.l - m.r) / Math.max(1, cats.length) : 0;
  const rotate = band && longest * 6.6 > bandW - 6;
  if (rotate) m.b = Math.min(160, 30 + longest * 5.2);
  const pw = Math.max(80, width - m.l - m.r);
  const ph = H - m.t - m.b;

  // Value extents (y), dropping non-positive values on log axes.
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

  const y = yLog
    ? logAxis(yMin, yMax, m.t + ph, m.t)
    : linearAxis(yMin, yMax, m.t + ph, m.t, plot.kind === 'bar');
  const x: Axis | undefined = band
    ? undefined
    : !Number.isFinite(xMin)
      ? undefined
      : xLog
        ? logAxis(xMin, xMax, m.l, m.l + pw)
        : linearAxis(xMin, xMax, m.l, m.l + pw, false);
  if (!band && !x) return <div className="plot-message">No {xLog ? 'positive ' : ''}x values to plot.</div>;

  // Horizontal position of series i at category/x value.
  const slot = band ? Math.min(24, (bandW * 0.8) / series.length) : 0;
  const slotGap = band && plot.kind === 'bar' ? 2 : 4;
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
  const capW = band ? Math.max(6, Math.min(12, slot * 0.6)) : 10;

  const xTitle = plot.xLabel ?? xCol.label;
  const yTitle = plot.yLabel ?? yCol.label;

  return (
    <div className="chart-box" onPointerLeave={() => setHover(null)}>
      <svg
        ref={props.svgRef}
        className="stat-chart"
        width={width}
        height={H}
        role="img"
        aria-label={`${yTitle} by ${xTitle}${props.seriesLabel ? ` and ${props.seriesLabel}` : ''}`}
      >
        <rect className="chart-bg" x={0} y={0} width={width} height={H} />
        {/* Gridlines and y axis */}
        <g className="chart-axis">
          {y.ticks.map((t, i) => (
            <g key={i}>
              {t.major && <line className="chart-grid" x1={m.l} x2={m.l + pw} y1={t.pos} y2={t.pos} />}
              <line x1={m.l - (t.major ? 5 : 3)} x2={m.l} y1={t.pos} y2={t.pos} />
              {t.label && (
                <text x={m.l - 8} y={t.pos} textAnchor="end" dominantBaseline="middle">
                  {t.label}
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
                    <text
                      x={cx}
                      y={m.t + ph + 16}
                      textAnchor={rotate ? 'end' : 'middle'}
                      transform={rotate ? `rotate(-40 ${cx} ${m.t + ph + 12})` : undefined}
                    >
                      {cellText(c)}
                    </text>
                  </g>
                );
              })
            : x!.ticks.map((t, i) => (
                <g key={i}>
                  <line x1={t.pos} x2={t.pos} y1={m.t + ph} y2={m.t + ph + (t.major ? 5 : 3)} />
                  {t.label && (
                    <text x={t.pos} y={m.t + ph + 18} textAnchor="middle">
                      {t.label}
                    </text>
                  )}
                </g>
              ))}
          <text className="axis-title" x={m.l + pw / 2} y={H - 8} textAnchor="middle">
            {xTitle}
          </text>
          <text
            className="axis-title"
            x={14}
            y={m.t + ph / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${m.t + ph / 2})`}
          >
            {yTitle}
          </text>
        </g>
        {/* Marks, one group per series */}
        {series.map((s, i) => {
          const c = color(i);
          const pts = s.points.filter((p) => okY(p.mean) && (band || okX(p.x as number)));
          return (
            <g key={JSON.stringify(s.key ?? null)}>
              {plot.kind === 'bar' &&
                pts.map((p) => (
                  <path
                    key={JSON.stringify(p.x)}
                    d={barPath(px(p.x, i) - slot / 2, slot, base, yClamp(p.mean), 4)}
                    fill={c}
                  />
                ))}
              {plot.kind === 'line' && pts.length > 1 && (
                <polyline
                  points={pts.map((p) => `${px(p.x, i)},${yClamp(p.mean)}`).join(' ')}
                  fill="none"
                  stroke={c}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {plot.error !== 'none' &&
                pts.map((p) =>
                  Number.isFinite(p.err) ? (
                    <g key={`e${JSON.stringify(p.x)}`} className="chart-err">
                      <line
                        x1={px(p.x, i)}
                        x2={px(p.x, i)}
                        y1={yClamp(p.mean - p.err)}
                        y2={yClamp(p.mean + p.err)}
                      />
                      <line
                        x1={px(p.x, i) - capW / 2}
                        x2={px(p.x, i) + capW / 2}
                        y1={yClamp(p.mean + p.err)}
                        y2={yClamp(p.mean + p.err)}
                      />
                      <line
                        x1={px(p.x, i) - capW / 2}
                        x2={px(p.x, i) + capW / 2}
                        y1={yClamp(p.mean - p.err)}
                        y2={yClamp(p.mean - p.err)}
                      />
                    </g>
                  ) : null,
                )}
              {plot.showPoints &&
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
                        r={3}
                        fill={plot.kind === 'bar' ? 'var(--surface)' : c}
                        stroke={plot.kind === 'bar' ? 'var(--text)' : 'var(--surface)'}
                        strokeWidth={plot.kind === 'bar' ? 1 : 1.5}
                        opacity={plot.kind === 'bar' ? 0.85 : 0.55}
                      />
                    );
                  }),
                )}
              {plot.kind !== 'bar' &&
                pts.map((p) => (
                  <circle
                    key={`m${JSON.stringify(p.x)}`}
                    cx={px(p.x, i)}
                    cy={yClamp(p.mean)}
                    r={5}
                    fill={c}
                    stroke="var(--surface)"
                    strokeWidth={2}
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
        {multi && (
          <g className="chart-legend" transform={`translate(${m.l}, 12)`}>
            {(() => {
              let off = 0;
              return series.map((s, i) => {
                const label = cellText(s.key) || '(none)';
                const g = (
                  <g key={label} transform={`translate(${off}, 0)`}>
                    <rect x={0} y={-5} width={10} height={10} rx={2} fill={color(i)} />
                    <text x={15} y={0} dominantBaseline="middle">
                      {label}
                    </text>
                  </g>
                );
                off += 28 + label.length * 6.6;
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
              {props.seriesLabel}: {cellText(hover.series)}
            </div>
          )}
          <div>
            {xCol.label}: <strong>{cellText(hover.point.x)}</strong>
          </div>
          <div>
            {plot.error === 'none' || !Number.isFinite(hover.point.err) ? (
              <>mean {fmt(hover.point.mean)}</>
            ) : (
              <>
                mean {fmt(hover.point.mean)} ± {fmt(hover.point.err)} (
                {ERRORS.find((e) => e.id === plot.error)?.label})
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

function ColumnSelect(props: {
  label: string;
  value: string;
  columns: ColumnDef[];
  onChange: (key: string) => void;
}) {
  const groups: { title: string; cols: ColumnDef[] }[] = [
    { title: 'Variables', cols: props.columns.filter((c) => c.kind === 'variable' || c.kind === 'sample') },
    { title: 'Statistics', cols: props.columns.filter((c) => c.kind === 'stat') },
    { title: 'Derived', cols: props.columns.filter((c) => c.kind === 'derived') },
  ].filter((g) => g.cols.length);
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

function useWidth(ref: React.RefObject<HTMLElement>): number {
  const [w, setW] = useState(760);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.floor(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function ChartsView() {
  const group = useGroup();
  const variables = useStore((s) => s.ws.variables);
  const mutate = useStore((s) => s.mutate);
  const { perSample, levels, stats } = useAnalysisTable(group);
  const [chartId, setChartId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useWidth(boxRef);

  const plot = group?.statPlots.find((p) => p.id === chartId) ?? group?.statPlots[0];
  const seriesKey = plot?.series ? `var:${plot.series}` : undefined;
  const summary = useMemo(
    () => (plot ? summaryForPlot(perSample.rows, plot.x, plot.y, seriesKey, plot.error, levels) : []),
    [plot, perSample, seriesKey, levels],
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
    <div className="ref-tabs chart-tabs" role="tablist" aria-label="Charts">
      {group.statPlots.map((p) => (
        <div key={p.id} className={`ref-tab${p.id === plot?.id ? ' on' : ''}`}>
          <button type="button" role="tab" aria-selected={p.id === plot?.id} onClick={() => setChartId(p.id)}>
            {p.name}
          </button>
        </div>
      ))}
      <button type="button" className="ref-add" onClick={() => addChart()} title="New chart">
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

  const exportSvg = () => {
    if (!svgRef.current) return;
    download(`${safeName(`${group.name}_${plot.name}`)}.svg`, standaloneSvg(svgRef.current), 'image/svg+xml');
  };
  const exportPng = async () => {
    if (!svgRef.current) return;
    try {
      const blob = await svgToPng(standaloneSvg(svgRef.current), width, 440, 300 / 96);
      download(`${safeName(`${group.name}_${plot.name}`)}.png`, blob, 'image/png');
    } catch (e) {
      toast(`PNG export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const errLabel = ERRORS.find((e) => e.id === plot.error)!.label;
  const exportCsv = () => {
    const header = [
      ...(seriesLabel ? [seriesLabel] : []),
      xCol?.label ?? plot.x,
      `${yCol?.label ?? plot.y} (mean)`,
      ...(plot.error !== 'none' ? [`${errLabel}`] : []),
      'n',
    ];
    const rows = summary.flatMap((s) =>
      s.points.map((p) => [
        ...(seriesLabel ? [s.key ?? ''] : []),
        p.x,
        p.mean,
        ...(plot.error !== 'none' ? [p.err] : []),
        p.n,
      ]),
    );
    download(`${safeName(`${group.name}_${plot.name}`)}_data.csv`, toCsv([header, ...rows]), 'text/csv');
  };

  return (
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
          {KINDS.map((k) => (
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
        <label className="field" title="Error bars over the replicates (rows) sharing an x value and colour">
          Error
          <select
            value={plot.error}
            onChange={(e) =>
              edit('Change chart error bars', (p) => void (p.error = e.target.value as StatPlot['error']))
            }
          >
            {ERRORS.map((e) => (
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
        <label className="field">
          X title
          <input
            type="text"
            value={plot.xLabel ?? ''}
            placeholder={xCol?.label}
            onChange={(e) =>
              edit(
                'Change x title',
                (p) => {
                  p.xLabel = e.target.value || undefined;
                },
                `chart-xl:${plot.id}`,
              )
            }
          />
        </label>
        <label className="field">
          Y title
          <input
            type="text"
            value={plot.yLabel ?? ''}
            placeholder={yCol?.label}
            onChange={(e) =>
              edit(
                'Change y title',
                (p) => {
                  p.yLabel = e.target.value || undefined;
                },
                `chart-yl:${plot.id}`,
              )
            }
          />
        </label>
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
            xCol={xCol}
            yCol={yCol}
            seriesLabel={seriesLabel}
            levels={levels}
            width={width}
            svgRef={svgRef}
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
                    {seriesLabel && <td className="text-cell">{cellText(s.key)}</td>}
                    <td className={typeof p.x === 'number' ? undefined : 'text-cell'}>{cellText(p.x)}</td>
                    <td>{fmt(p.mean)}</td>
                    {plot.error !== 'none' && <td>{fmt(p.err)}</td>}
                    <td>{p.n}</td>
                    <td className="muted small text-cell">{p.values.map(fmt).join(', ')}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
