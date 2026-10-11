import type { ChartStyle, StatPlot } from '@flowmeris/model';
import type { Cell, ColumnDef, PlotPoint, PlotSeries } from '@flowmeris/table';
import { SupLabel } from '../../components/ui/SupLabel.tsx';
import { type Axis, barPath } from '../../lib/chartAxis.ts';
import { markerPath, meanLineLength } from '../../lib/chartMarks.ts';
import { CHART_ERRORS, cellText, fmtChart, seriesKey } from '../../lib/chartStyle.ts';
import { textCss } from '../../lib/figure.ts';

/** Rough width of text in px (no layout pass needed). */
export const textW = (s: string, size: number) => s.length * size * 0.6;

/** A point under the pointer, for the tooltip. */
export interface Hover {
  x: number;
  y: number;
  series: Cell;
  point: PlotPoint;
}

/** Where everything of a chart goes: the plot area, its axes and the marks' positions. */
export interface ChartFrame {
  plot: StatPlot;
  st: ChartStyle;
  series: PlotSeries[];
  /** Margins around the plot area, and its size. */
  m: { l: number; r: number; t: number; b: number };
  pw: number;
  ph: number;
  /** The chart's size: as asked, or smaller when a box aspect ratio leaves space over. */
  W: number;
  H: number;
  y: Axis;
  /** The x axis; undefined when x is a band of categories. */
  x: Axis | undefined;
  band: boolean;
  bandW: number;
  /** Categories of a band axis, in display order. */
  cats: Cell[];
  /** Whether band labels are rotated to fit. */
  rotate: boolean;
  /** Horizontal position of series i at x value `xv`. */
  px: (xv: Cell, i: number) => number;
  /** y of a value, kept inside the plot area. */
  yClamp: (v: number) => number;
  /** y of the bars' baseline. */
  base: number;
  /** Width of one series' bar or replicate spread in a band. */
  slot: number;
  okX: (v: number) => boolean;
  okY: (v: number) => boolean;
  color: (i: number) => string;
  nameOf: (s: PlotSeries) => string;
}

/** Gridlines, both axes with their ticks and labels, and the axis titles. */
export function ChartAxes({
  f,
  xTitle,
  yTitle,
  axisTitle,
}: {
  f: ChartFrame;
  xTitle: string;
  yTitle: string;
  axisTitle: (axis: 'x' | 'y', text: string) => object;
}) {
  const { st, m, pw, ph, H, y } = f;
  const fs = st.tickFontSize;
  const ts = st.titleFontSize;
  const tickText = { fontSize: fs, ...textCss(st.tickText, st.fontFamily, st.fontColor) };
  const titleText = { fontSize: ts, ...textCss(st.titleText, st.fontFamily, st.fontColor) };
  // Unset colours keep the theme's, from the CSS.
  const tick = { stroke: st.tickColor, strokeWidth: st.tickWidth };
  const spine = { stroke: st.spineColor, strokeWidth: st.spineWidth };
  return (
    <g className="chart-axis">
      {y.ticks.map((t, i) => (
        <g key={i}>
          {st.showGrid && t.major && (
            <line className="chart-grid" x1={m.l} x2={m.l + pw} y1={t.pos} y2={t.pos} />
          )}
          {st.tickWidth > 0 && (
            <line x1={m.l - (t.major ? 5 : 3)} x2={m.l} y1={t.pos} y2={t.pos} style={tick} />
          )}
          {st.showTickLabels && t.label && (
            <text x={m.l - 8} y={t.pos} textAnchor="end" dominantBaseline="middle" style={tickText}>
              <SupLabel label={t.label} fontSize={fs} />
            </text>
          )}
        </g>
      ))}
      {st.spineWidth > 0 && (
        <>
          <line className="chart-spine" x1={m.l} x2={m.l} y1={m.t} y2={m.t + ph} style={spine} />
          <line className="chart-spine" x1={m.l} x2={m.l + pw} y1={m.t + ph} y2={m.t + ph} style={spine} />
        </>
      )}
      {f.band
        ? f.cats.map((c, i) => {
            const cx = m.l + f.bandW * (i + 0.5);
            return (
              <g key={i}>
                {st.tickWidth > 0 && <line x1={cx} x2={cx} y1={m.t + ph} y2={m.t + ph + 4} style={tick} />}
                {st.showTickLabels && (
                  <text
                    x={cx}
                    y={m.t + ph + fs + 5}
                    textAnchor={f.rotate ? 'end' : 'middle'}
                    transform={f.rotate ? `rotate(-40 ${cx} ${m.t + ph + fs + 1})` : undefined}
                    style={tickText}
                  >
                    {cellText(c)}
                  </text>
                )}
              </g>
            );
          })
        : f.x!.ticks.map((t, i) => (
            <g key={i}>
              {st.tickWidth > 0 && (
                <line x1={t.pos} x2={t.pos} y1={m.t + ph} y2={m.t + ph + (t.major ? 5 : 3)} style={tick} />
              )}
              {st.showTickLabels && t.label && (
                <text x={t.pos} y={m.t + ph + fs + 7} textAnchor="middle" style={tickText}>
                  <SupLabel label={t.label} fontSize={fs} />
                </text>
              )}
            </g>
          ))}
      {xTitle && (
        <text {...axisTitle('x', xTitle)} x={m.l + pw / 2} y={H - 8} textAnchor="middle" style={titleText}>
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
          style={titleText}
        >
          {yTitle}
        </text>
      )}
    </g>
  );
}

/** Error bars of `pts`: a line over ± err with caps `capW` wide. */
function ErrorBars({ f, pts, i, capW }: { f: ChartFrame; pts: PlotPoint[]; i: number; capW: number }) {
  // An unset colour keeps the theme's, from the CSS.
  const lw = { strokeWidth: f.st.errorWidth, stroke: f.st.errorColor };
  return pts.map((p) => {
    if (!Number.isFinite(p.err)) return null;
    const cx = f.px(p.x, i);
    const hi = f.yClamp(p.mean + p.err);
    const lo = f.yClamp(p.mean - p.err);
    return (
      <g key={`e${JSON.stringify(p.x)}`} className="chart-err">
        <line x1={cx} x2={cx} y1={lo} y2={hi} style={lw} />
        {capW > 0 && (
          <>
            <line x1={cx - capW / 2} x2={cx + capW / 2} y1={hi} y2={hi} style={lw} />
            <line x1={cx - capW / 2} x2={cx + capW / 2} y1={lo} y2={lo} style={lw} />
          </>
        )}
      </g>
    );
  });
}

/** The marks of series `i`: bars or line, error bars, replicates, mean markers and hover targets. */
export function SeriesMarks({
  f,
  s,
  i,
  onHover,
}: {
  f: ChartFrame;
  s: PlotSeries;
  i: number;
  onHover: (h: Hover) => void;
}) {
  const { plot, st, px, yClamp, base, slot, okY } = f;
  const c = f.color(i);
  const bar = plot.kind === 'bar';
  const pts = s.points.filter((p) => okY(p.mean) && (f.band || f.okX(p.x as number)));
  const capW = st.capWidth ?? (f.band ? Math.max(6, Math.min(12, slot * 0.6)) : 10);
  const pointOpacity = st.pointOpacity ?? (bar ? 0.85 : 0.55);
  return (
    <g>
      {bar &&
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
          points={pts.map((p) => `${px(p.x, i)},${f.y.map(p.mean)}`).join(' ')}
          fill="none"
          stroke={c}
          strokeWidth={st.lineWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {plot.error !== 'none' && st.errorWidth > 0 && <ErrorBars f={f} pts={pts} i={i} capW={capW} />}
      {plot.showPoints &&
        st.pointSize > 0 &&
        pts.flatMap((p) =>
          p.values.filter(okY).map((v, j) => {
            const spread = f.band ? Math.max(0, slot * 0.7) : 0;
            const dx = p.values.length > 1 ? (j / (p.values.length - 1) - 0.5) * spread : 0;
            return (
              <circle
                key={`r${JSON.stringify(p.x)}${j}`}
                className="chart-rep"
                cx={px(p.x, i) + dx}
                cy={f.y.map(v)}
                r={st.pointSize}
                fill={bar ? 'var(--surface)' : c}
                stroke={st.markerEdgeColor ?? (bar ? 'var(--text)' : 'var(--surface)')}
                strokeWidth={bar ? 1 : 1.5}
                opacity={pointOpacity}
              />
            );
          }),
        )}
      {!bar &&
        pts.map((p) => (
          <MeanMarker key={`m${JSON.stringify(p.x)}`} f={f} cx={px(p.x, i)} cy={f.y.map(p.mean)} color={c} />
        ))}
      {/* Hit targets larger than the marks */}
      {pts.map((p) => (
        <rect
          key={`h${JSON.stringify(p.x)}`}
          className="chart-hit"
          x={px(p.x, i) - Math.max(10, slot / 2 + 2)}
          y={bar ? Math.min(base, yClamp(p.mean)) - 8 : yClamp(p.mean) - 12}
          width={Math.max(20, slot + 4)}
          height={bar ? Math.abs(base - yClamp(p.mean)) + 16 : 24}
          onPointerEnter={() => onHover({ x: px(p.x, i), y: yClamp(p.mean), series: s.key, point: p })}
        />
      ))}
    </g>
  );
}

/** The mean marker of a point at (cx, cy) in series colour `color`: a shape, or a horizontal line. */
function MeanMarker({ f, cx, cy, color }: { f: ChartFrame; cx: number; cy: number; color: string }) {
  const { st } = f;
  if (st.markerShape === 'hline') {
    const half = meanLineLength(st, f.band, f.slot) / 2;
    if (st.meanLineWidth <= 0 || half <= 0) return null;
    return (
      <line
        className="chart-mean-line"
        x1={cx - half}
        x2={cx + half}
        y1={cy}
        y2={cy}
        stroke={st.meanLineColor ?? color}
        strokeWidth={st.meanLineWidth}
        strokeOpacity={st.fillOpacity}
      />
    );
  }
  if (st.markerSize <= 0) return null;
  const paint = {
    fill: color,
    fillOpacity: st.fillOpacity,
    stroke: st.markerEdgeColor ?? 'var(--surface)',
    strokeWidth: Math.min(2, st.markerSize / 2),
  };
  return st.markerShape === 'circle' ? (
    <circle cx={cx} cy={cy} r={st.markerSize} {...paint} />
  ) : (
    <path d={markerPath(st.markerShape, cx, cy, st.markerSize)} strokeLinejoin="round" {...paint} />
  );
}

/** The legend, above the plot area or right of it. */
export function ChartLegend({ f, legend }: { f: ChartFrame; legend: 'top' | 'right' }) {
  const { m, st } = f;
  const ls = st.legendFontSize;
  const sw = Math.round(ls * 0.85);
  const legendText = { fontSize: ls, ...textCss(st.legendText, st.fontFamily, st.fontColor) };
  let off = 0;
  return (
    <g
      className="chart-legend"
      transform={
        legend === 'top'
          ? `translate(${m.l}, ${8 + ls / 2})`
          : `translate(${m.l + f.pw + 16}, ${m.t + ls / 2})`
      }
    >
      {f.series.map((s, i) => {
        const label = f.nameOf(s);
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
              fill={f.color(i)}
              fillOpacity={st.fillOpacity}
            />
            <text x={sw + 5} y={0} dominantBaseline="middle" style={legendText}>
              {label}
            </text>
          </g>
        );
        off += sw + 18 + textW(label, ls);
        return g;
      })}
    </g>
  );
}

/** The tooltip of the hovered point: its series, x, mean ± error and n. */
export function ChartTip({
  f,
  hover,
  width,
  xCol,
  seriesLabel,
}: {
  f: ChartFrame;
  hover: Hover;
  width: number;
  xCol: ColumnDef;
  seriesLabel: string | undefined;
}) {
  const { plot, series } = f;
  return (
    <div
      className="chart-tip"
      style={{ left: Math.min(hover.x + 12, width - 200), top: Math.max(0, hover.y - 64) }}
    >
      {seriesLabel && series.length > 1 && (
        <div>
          <span
            className="swatch"
            style={{ background: f.color(series.findIndex((s) => s.key === hover.series)) }}
          />{' '}
          {seriesLabel}: {f.nameOf(series.find((s) => s.key === hover.series)!)}
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
  );
}
