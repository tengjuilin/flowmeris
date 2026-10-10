import type { ChartStyle, StatPlot } from '@flowmeris/model';
import { type Cell, type ColumnDef, type LevelOrder, type PlotSeries, compareCells } from '@flowmeris/table';
import { useId, useMemo, useState } from 'react';
import { type Anchor, pickerTrigger } from '../../components/ui/PickerMenu.tsx';
import { type Axis, dataExtents, makeAxis, validFix } from '../../lib/chartAxis.ts';
import { bandSlots, chartMargins } from '../../lib/chartLayout.ts';
import { cellText, seriesColor, seriesKey } from '../../lib/chartStyle.ts';
import { FONT_STACKS } from '../../lib/figure.ts';
import {
  ChartAxes,
  type ChartFrame,
  ChartLegend,
  ChartTip,
  type Hover,
  SeriesMarks,
  textW,
} from './ChartParts.tsx';

/** A statistics chart: the means of `series` against x, with error bars, replicates and a legend. */
export function Chart(props: {
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
  const ext = dataExtents(series, {
    okX,
    okY,
    band,
    showPoints: plot.showPoints,
  });
  const { dropped } = ext;
  if (!Number.isFinite(ext.yMin))
    return <div className="plot-message">No {yLog ? 'positive ' : ''}values to plot.</div>;
  if (!band && !Number.isFinite(ext.xMin))
    return <div className="plot-message">No {xLog ? 'positive ' : ''}x values to plot.</div>;

  const xTitle = (plot.xLabel ?? xCol.label).trim();
  const yTitle = (plot.yLabel ?? yCol.label).trim();
  const legend = multi ? st.legend : 'none';
  const H = props.height;
  const { f, clip } = frameChart({
    plot,
    series,
    cats,
    band,
    okX,
    okY,
    color,
    nameOf,
    H,
    width,
    ext,
    xLog,
    yLog,
    xTitle,
    yTitle,
    legend,
  });
  const { m, pw, ph } = f;

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
        <ChartAxes f={f} xTitle={xTitle} yTitle={yTitle} axisTitle={axisTitle} />
        {/* Marks, one group per series */}
        <g clipPath={clip ? `url(#${clipId})` : undefined}>
          {series.map((s, i) => (
            <SeriesMarks key={seriesKey(s.key)} f={f} s={s} i={i} onHover={setHover} />
          ))}
        </g>
        {legend !== 'none' && <ChartLegend f={f} legend={legend} />}
      </svg>
      {/* Not when the hovered point's series is gone (e.g. "Colour by" undone under the pointer). */}
      {hover && series.some((s) => s.key === hover.series) && (
        <ChartTip f={f} hover={hover} width={width} xCol={xCol} seriesLabel={props.seriesLabel} />
      )}
      {dropped > 0 && (
        <p className="plot-note">
          {dropped} point(s) not shown (non-positive on a log axis, or not a number).
        </p>
      )}
    </div>
  );
}

/** Margins, axes and mark positions of a chart with data extents `ext` (see `dataExtents`). */
function frameChart(
  a: Pick<ChartFrame, 'plot' | 'series' | 'cats' | 'band' | 'okX' | 'okY' | 'color' | 'nameOf' | 'H'> & {
    width: number;
    ext: ReturnType<typeof dataExtents>;
    xLog: boolean;
    yLog: boolean;
    xTitle: string;
    yTitle: string;
    legend: ChartStyle['legend'];
  },
) {
  const { plot, series, cats, band, okX, okY, color, nameOf, H, width, xLog, yLog, xTitle, yTitle, legend } =
    a;
  const { yMin, yMax, xMin, xMax } = a.ext;
  const st = plot.style;
  const xFix = band ? {} : validFix(st.xMin, st.xMax, xLog);
  const yFix = validFix(st.yMin, st.yMax, yLog);
  const yAxisAt = (p0: number, p1: number) =>
    makeAxis(yMin, yMax, p0, p1, { log: yLog, zero: plot.kind === 'bar', fix: yFix, ticks: st.yTicks });

  // Margins from the text they hold.
  const fs = st.tickFontSize;
  const ts = st.titleFontSize;
  const ls = st.legendFontSize;
  const legendW = legend === 'right' ? 24 + Math.max(...series.map((s) => textW(nameOf(s), ls))) : 0;
  const yLabelW = st.showTickLabels ? Math.max(0, ...yAxisAt(0, 1).ticks.map((t) => textW(t.label, fs))) : 0;
  const m = chartMargins(st, { xTitle: !!xTitle, yTitle: !!yTitle, legend, legendW, yLabelW });
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
  const {
    slot,
    gap: slotGap,
    groupW,
  } = band
    ? bandSlots(bandW, series.length, st.barWidth, plot.kind === 'bar')
    : { slot: 0, gap: 4, groupW: 0 };
  const px = (xv: Cell, i: number): number => {
    if (band) {
      const c = cats.findIndex((k) => JSON.stringify(k) === JSON.stringify(xv));
      return m.l + bandW * (c + 0.5) - groupW / 2 + i * (slot + slotGap) + slot / 2;
    }
    return x!.map(xv as number);
  };
  const yClamp = (v: number) => (yLog && v <= 0 ? m.t + ph : Math.max(m.t, Math.min(m.t + ph, y.map(v))));
  const base = plot.kind === 'bar' ? (yLog ? m.t + ph : y.map(Math.max(y.lo, Math.min(0, y.hi)))) : 0;
  const f: ChartFrame = {
    plot,
    st,
    series,
    m,
    pw,
    ph,
    H,
    y,
    x,
    band,
    bandW,
    cats,
    rotate,
    px,
    yClamp,
    base,
    slot,
    okX,
    okY,
    color,
    nameOf,
  };
  return { f, clip };
}
