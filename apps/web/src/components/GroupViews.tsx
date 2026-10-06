import type { HistogramResponse } from '@flowmeris/engine';
import type { Group, PlotSpec } from '@flowmeris/model';
import { axisTicks, formatLinear } from '@flowmeris/transforms';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { lineageKey } from '../lib/analysis.ts';
import { defaultAxis } from '../lib/defaults.ts';
import { download, safeName } from '../lib/download.ts';
import { standaloneSvg } from '../lib/exportPlot.ts';
import { scaleFor } from '../lib/geometry.ts';
import { contextFor, useGroup, useSampleNames, useSelectedSampleIds, useStore } from '../state/store.ts';
import { PlotCanvas } from './PlotCanvas.tsx';
import { AxisSelects, PlotKindSelect, usePlotForPopulation } from './PlotPanel.tsx';
import { FONT_STACKS, ridgeColor, useRidge } from './RidgeInspector.tsx';
import { useSize } from './hooks.ts';

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `…${s.slice(s.length - n + 1)}`;
}

function useVisible<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => setVis(es.some((e) => e.isIntersecting)), {
      rootMargin: '200px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, vis];
}

function Tile({
  group,
  sampleId,
  plot,
  size,
  name,
}: { group: Group; sampleId: string; plot: PlotSpec; size: number; name: string }) {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const [ref, visible] = useVisible<HTMLDivElement>();
  const s = ws.samples[sampleId];
  const ov = group.overrides.some((o) => o.sampleId === sampleId);
  return (
    <div className={`tile${ui.sampleId === sampleId ? ' on' : ''}`} ref={ref}>
      <button
        type="button"
        className="tile-title"
        title={`${s?.relativePath} — open in the plot view`}
        onClick={() => setUi({ sampleId, view: 'plot' })}
      >
        <span>{name}</span>
        {ov && <span className="badge warn">override</span>}
      </button>
      <div style={{ width: size, height: size }}>
        {visible && (
          <PlotCanvas
            ws={ws}
            group={group}
            sampleId={sampleId}
            plot={plot}
            width={size}
            height={size}
            compact
          />
        )}
      </div>
    </div>
  );
}

export function TilesView() {
  const group = useGroup();
  const plot = usePlotForPopulation();
  const names = useSampleNames(group);
  const shown = useSelectedSampleIds(group);
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const [tile, setTile] = useState(220);
  if (!group || !plot)
    return (
      <div className="empty">Open a plot first; tiles show that plot for every sample in the group.</div>
    );
  const pop = group.template.populations[plot.population];
  return (
    <div className="tiles-view" ref={box}>
      <div className="toolbar">
        <strong>{pop?.name}</strong>
        <PlotKindSelect group={group} plot={plot} />
        <AxisSelects group={group} plot={plot} />
        <span className="muted">
          {shown.length === group.sampleIds.length
            ? `${shown.length} samples`
            : `${shown.length} of ${group.sampleIds.length} samples`}
        </span>
        <div className="spacer" />
        <label className="field">
          Tile size
          <input
            type="range"
            min={140}
            max={420}
            value={tile}
            onChange={(e) => setTile(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="muted small">
        Gates are drawn from the group template; samples with overrides are flagged and drawn with their own
        gate. Click a tile to edit that sample. Plot type and axes are shared with the Plot view; choose
        samples with the checkboxes in the sidebar.
      </p>
      {shown.length === 0 && <div className="empty">No samples selected: check some in the sidebar.</div>}
      <div
        className="tiles"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, Math.floor((width - 16) / (tile + 12)))}, ${tile}px)`,
        }}
      >
        {shown.map((id) => (
          <Tile key={id} group={group} sampleId={id} plot={plot} size={tile} name={names[id] ?? id} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ridge plot: one mode-normalised histogram per sample on a shared x axis.
// ---------------------------------------------------------------------------

export function RidgeView() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const mutate = useStore((s) => s.mutate);
  const { group, plot, style, overlap, ch, axis, ordered, names, update } = useRidge();
  const box = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { width } = useSize(box);
  const [data, setData] = useState<Record<string, HistogramResponse>>({});

  useEffect(() => {
    if (group && !axis && ch)
      mutate('Default axis', (w) => {
        defaultAxis(w, w.groups.find((x) => x.id === group.id)!, ch);
      });
  }, [group, axis, ch, mutate]);

  const key = useMemo(
    () =>
      group && axis
        ? JSON.stringify([
            [...ordered].sort().map((s) => lineageKey(ws, group, s, ui.popId)),
            axis,
            ws.transforms[axis.transform],
          ])
        : '',
    [group, ordered, axis, ws, ui.popId],
  );
  useEffect(() => {
    if (!group || !axis) return;
    let live = true;
    const ctx = contextFor(ws, group);
    const style = {
      ...(plot?.style ?? { histBins: 256, histNorm: 'mode' as const, histSmooth: true }),
      histBins: 256,
      histNorm: 'mode' as const,
      histSmooth: true,
    };
    setData({});
    for (const sid of ordered) {
      if (ui.missing[sid]) continue;
      pool
        .histogram(ctx, sid, ui.popId, axis, style as PlotSpec['style'])
        .then((h) => live && setData((d) => ({ ...d, [sid]: h })))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [key]);

  if (!group || !axis) return <div className="empty">Select a group.</div>;
  const n = Math.max(1, ordered.length);
  const labelW = style.showLabels ? style.labelWidth : 20;
  const W = style.width ?? Math.max(400, width - 24);
  const pw = Math.max(50, W - labelW - 20);
  const rowH = style.rowHeight ?? Math.max(18, Math.min(60, 600 / n));
  const amp = rowH / (1 - overlap);
  const axisY = 20 + rowH * (n - 1) + amp + 6;
  const tickLabelY = style.tickFontSize + 7;
  const pop = group.template.populations[ui.popId];
  const sample0 = ws.samples[group.sampleIds[0] ?? ''];
  const marker = sample0?.channels.find((c) => c.pnn === ch)?.pns;
  const title = (style.axisTitle ?? (marker ? `${marker} :: ${ch}` : ch)).trim();
  const titleY = (style.showTickLabels ? tickLabelY : 6) + style.titleFontSize + 2;
  const H = axisY + (title ? titleY : style.showTickLabels ? tickLabelY : 6) + 6;
  const X = (v: number) => labelW + ((v - axis.range[0]) / (axis.range[1] - axis.range[0])) * pw;
  let ticks: { pos: number; label: string; major: boolean }[] = [];
  try {
    const s = scaleFor(ws, axis.transform);
    const [lo, hi] = axis.range;
    ticks = style.ticks
      ? style.ticks
          .map((t) => ({ pos: s.apply(t.value), label: t.label ?? formatLinear(t.value), major: true }))
          .filter((t) => Number.isFinite(t.pos) && t.pos >= lo - 1e-9 && t.pos <= hi + 1e-9)
      : axisTicks(s.def, s.apply, s.inverse, lo, hi);
  } catch {
    /* ignore */
  }
  const labelChars = Math.max(4, Math.floor((labelW - 8) / (style.labelFontSize * 0.55)));

  return (
    <div className="ridge-view" ref={box}>
      <div className="toolbar">
        <label className="field">
          Channel
          <select
            value={ch}
            onChange={(e) => {
              const c = e.target.value;
              update('Ridge channel', (l, w, g) => {
                l.axis = { ...defaultAxis(w, g, c) };
              });
            }}
          >
            {group.channels.map((c) => (
              <option key={c} value={c}>
                {c}
                {sample0?.channels.find((x) => x.pnn === c)?.pns
                  ? ` (${sample0.channels.find((x) => x.pnn === c)!.pns})`
                  : ''}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          Population: {pop?.name}
          {ordered.length < group.sampleIds.length &&
            ` · ${ordered.length} of ${group.sampleIds.length} samples (sidebar selection)`}
        </span>
        <div className="spacer" />
        <button
          type="button"
          onClick={() => {
            if (!svgRef.current) return;
            download(
              `${safeName(`${group.name}_${pop?.name}_${ch}_ridge`)}.svg`,
              standaloneSvg(svgRef.current),
              'image/svg+xml',
            );
          }}
        >
          SVG
        </button>
      </div>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        className="ridge"
        role="img"
        aria-label={`Ridge plot of ${ch} for ${pop?.name}`}
        style={{ fontFamily: FONT_STACKS[style.fontFamily] }}
      >
        <rect width={W} height={H} fill="var(--surface)" />
        {ordered.map((sid, i) => {
          const h = data[sid];
          const base = 20 + rowH * i + amp;
          const s = ws.samples[sid];
          let d = '';
          if (h) {
            d = `M${X(h.centers[0]!)},${base}`;
            for (let k = 0; k < h.centers.length; k++)
              d += `L${X(h.centers[k]!)},${base - h.heights[k]! * amp}`;
            d += `L${X(h.centers[h.centers.length - 1]!)},${base}Z`;
          }
          const count = !style.showCounts
            ? ''
            : h
              ? ` (n=${h.eventsPlotted.toLocaleString()})`
              : ui.missing[sid]
                ? ' (missing)'
                : '';
          const custom = style.sampleLabels[sid];
          const name =
            custom ?? truncate(names[sid] ?? s?.fileName ?? '', Math.max(4, labelChars - count.length));
          return (
            <g key={sid}>
              {style.showLabels && (
                <text
                  x={labelW - 8}
                  y={base - 3}
                  textAnchor="end"
                  className="ridge-label"
                  style={{ fontSize: style.labelFontSize }}
                >
                  <title>{s?.relativePath}</title>
                  {name}
                  {count}
                </text>
              )}
              {h && (
                <path
                  d={d}
                  fill={ridgeColor(style, sid, i)}
                  fillOpacity={style.fillOpacity}
                  stroke={style.strokeColor ?? 'var(--surface)'}
                  strokeWidth={style.strokeWidth}
                />
              )}
              <line x1={labelW} x2={labelW + pw} y1={base} y2={base} className="ridge-base" />
            </g>
          );
        })}
        <g className="axis" transform={`translate(0,${axisY})`}>
          {ticks.map((t, i) => (
            <g key={i} transform={`translate(${X(t.pos)},0)`}>
              <line y2={t.major ? 6 : 3} />
              {style.showTickLabels && t.label && (
                <text y={tickLabelY} textAnchor="middle" style={{ fontSize: style.tickFontSize }}>
                  {t.label}
                </text>
              )}
            </g>
          ))}
          {title && (
            <text
              x={labelW + pw / 2}
              y={titleY}
              textAnchor="middle"
              className="axis-title"
              style={{ fontSize: style.titleFontSize }}
            >
              {title}
            </text>
          )}
        </g>
      </svg>
      <p className="muted small">
        Each curve is a histogram normalised to its own mode (smoothed, σ = 1.5 bins); n is the number of
        events in the population. Customise colours, labels, order and axes in the panel on the right.
      </p>
    </div>
  );
}
