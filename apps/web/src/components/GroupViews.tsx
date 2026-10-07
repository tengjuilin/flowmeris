import type { HistogramResponse } from '@flowmeris/engine';
import type { Group, PlotSpec } from '@flowmeris/model';
import { axisTicks, formatLinear } from '@flowmeris/transforms';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { lineageKey } from '../lib/analysis.ts';
import { defaultAxis } from '../lib/defaults.ts';
import { download, safeName } from '../lib/download.ts';
import { standaloneSvg } from '../lib/exportPlot.ts';
import { scaleFor } from '../lib/geometry.ts';
import { type RidgeCurve, combineCounts } from '../lib/ridge.ts';
import { contextFor, useGroup, useSampleNames, useSelectedSampleIds, useStore } from '../state/store.ts';
import { PlotCanvas } from './PlotCanvas.tsx';
import {
  AxisSelects,
  EditScopeToggle,
  PlotKindSelect,
  ToolButtons,
  drill,
  usePlotForPopulation,
} from './PlotPanel.tsx';
import { PopulationTree } from './PopulationTree.tsx';
import { FONT_STACKS, ridgeColor, useRidge } from './RidgeInspector.tsx';
import { useSize } from './hooks.ts';

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `…${s.slice(s.length - n + 1)}`;
}

// One observer shared by every tile (hundreds of tiles would otherwise each own one).
const visibility = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | null = null;

function useVisible<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    observer ??= new IntersectionObserver(
      (es) => {
        for (const e of es) visibility.get(e.target)?.(e.isIntersecting);
      },
      { rootMargin: '200px' },
    );
    visibility.set(el, setVis);
    observer.observe(el);
    return () => {
      visibility.delete(el);
      observer?.unobserve(el);
    };
  }, []);
  return [ref, vis];
}

/** The value, once it has stopped changing for `ms` (e.g. a slider being dragged). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

const Tile = memo(function Tile({
  group,
  sampleId,
  plot,
  size,
  renderSize,
  name,
}: { group: Group; sampleId: string; plot: PlotSpec; size: number; renderSize: number; name: string }) {
  const ws = useStore((s) => s.ws);
  const current = useStore((s) => s.ui.sampleId === sampleId);
  const setUi = useStore((s) => s.setUi);
  const [ref, visible] = useVisible<HTMLDivElement>();
  const s = ws.samples[sampleId];
  const ov = group.overrides.some((o) => o.sampleId === sampleId);
  return (
    <div
      className={`tile${current ? ' on' : ''}`}
      ref={ref}
      // Selecting a tile makes it the gated sample; the tools then act on it as in the Gate view.
      onPointerDownCapture={() => {
        if (!current) setUi({ sampleId, selectedGateId: null });
      }}
    >
      <button
        type="button"
        className="tile-title"
        title={`${s?.relativePath} — open in the Gate view`}
        onClick={() => setUi({ sampleId, view: 'gate' })}
      >
        <span>{name}</span>
        {ov && <span className="badge warn">override</span>}
      </button>
      <div style={{ width: size, height: size, overflow: 'hidden' }}>
        {/* While the size slider moves, the last render is stretched to the live size; it is redrawn
            sharp at `renderSize` once the slider settles. */}
        {visible && (
          <div
            style={
              size === renderSize
                ? undefined
                : { transform: `scale(${size / renderSize})`, transformOrigin: '0 0' }
            }
          >
            <PlotCanvas
              ws={ws}
              group={group}
              sampleId={sampleId}
              plot={plot}
              width={renderSize}
              height={renderSize}
              hideOffScaleNote
              interactive={current}
              onDrill={drill}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export function TilesView() {
  const group = useGroup();
  const plot = usePlotForPopulation();
  const names = useSampleNames(group);
  const shown = useSelectedSampleIds(group);
  const [tile, setTile] = useState(280);
  // Re-lay out and re-render the tiles once the slider settles, not on every step of a drag.
  // Tiles resize live; their plots are recomputed at the new size once the slider settles.
  const renderSize = useSettled(tile, 150);
  if (!group || !plot)
    return (
      <div className="empty">Open a plot first; tiles show that plot for every sample in the group.</div>
    );
  const pop = group.template.populations[plot.population];
  return (
    <div className="tiles-view">
      <div className="toolbar">
        <strong>{pop?.name}</strong>
        <PlotKindSelect group={group} plot={plot} />
        <AxisSelects group={group} plot={plot} />
        <ToolButtons is1d={plot.kind === 'histogram'} />
        <EditScopeToggle />
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
            min={200}
            max={520}
            value={tile}
            onChange={(e) => setTile(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="muted small">
        Gates are drawn from the group template; samples with overrides are flagged and drawn with their own
        gate. Click a tile to select it, then gate on it with the tools above; click its title to open it in
        the Gate view. Plot type and axes are shared with the Gate view; choose samples with the checkboxes in
        the sidebar.
      </p>
      {shown.length === 0 && <div className="empty">No samples selected: check some in the sidebar.</div>}
      {/* The population card floats top-right: tiles flow beside it, then use the full width below it. */}
      <div className="tiles">
        <div className="tiles-side">
          <PopulationTree />
        </div>
        {shown.map((id) => (
          <Tile
            key={id}
            group={group}
            sampleId={id}
            plot={plot}
            size={tile}
            renderSize={renderSize}
            name={names[id] ?? id}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ridge plot: one mode-normalised histogram per sample, or per set of combined replicates, on a
// shared x axis.
// ---------------------------------------------------------------------------

export function RidgeView() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const mutate = useStore((s) => s.mutate);
  const { group, plot, style, combine, overlap, ch, axis, rows, update } = useRidge();
  const sampleIds = useMemo(() => rows.flatMap((r) => r.sampleIds), [rows]);
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
            [...sampleIds].sort().map((s) => lineageKey(ws, group, s, ui.popId)),
            axis,
            ws.transforms[axis.transform],
          ])
        : '',
    [group, sampleIds, axis, ws, ui.popId],
  );
  useEffect(() => {
    if (!group || !axis) return;
    let live = true;
    const ctx = contextFor(ws, group);
    // Counts, so replicates can be combined; each ridge is scaled to its mode below.
    const style = {
      ...(plot?.style ?? { histBins: 256, histNorm: 'count' as const, histSmooth: true }),
      histBins: 256,
      histNorm: 'count' as const,
      histSmooth: true,
    };
    setData({});
    for (const sid of sampleIds) {
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

  // A combined ridge is drawn once all its replicates (other than missing files) have loaded.
  const curves = useMemo(() => {
    const out: Record<string, RidgeCurve | null> = {};
    for (const r of rows) {
      const ids = r.sampleIds.filter((id) => !ui.missing[id]);
      const hs = ids.flatMap((id) => data[id] ?? []);
      out[r.id] =
        hs.length && hs.length === ids.length ? combineCounts(hs, combine.method, combine.band) : null;
    }
    return out;
  }, [rows, data, ui.missing, combine.method, combine.band]);

  if (!group || !axis) return <div className="empty">Select a group.</div>;
  const n = Math.max(1, rows.length);
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
          {sampleIds.length < group.sampleIds.length &&
            ` · ${sampleIds.length} of ${group.sampleIds.length} samples (sidebar selection)`}
          {combine.enabled &&
            ` · replicates combined (${combine.method === 'mean' ? 'average of curves' : 'pooled events'})`}
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
        {rows.map((r, i) => {
          const h = curves[r.id];
          const base = 20 + rowH * i + amp;
          const Y = (v: number) => base - v * amp;
          let d = '';
          let band = '';
          if (h) {
            const last = h.centers.length - 1;
            d = `M${X(h.centers[0]!)},${base}`;
            for (let k = 0; k <= last; k++) d += `L${X(h.centers[k]!)},${Y(h.heights[k]!)}`;
            d += `L${X(h.centers[last]!)},${base}Z`;
            if (h.band) {
              band = `M${X(h.centers[0]!)},${Y(h.band.hi[0]!)}`;
              for (let k = 1; k <= last; k++) band += `L${X(h.centers[k]!)},${Y(h.band.hi[k]!)}`;
              for (let k = last; k >= 0; k--) band += `L${X(h.centers[k]!)},${Y(h.band.lo[k]!)}`;
              band += 'Z';
            }
          }
          const missing = r.sampleIds.every((id) => ui.missing[id]);
          const reps = r.sampleIds.length > 1 || combine.enabled ? `${r.sampleIds.length}×, ` : '';
          const count = !style.showCounts
            ? ''
            : h
              ? ` (${reps}n=${h.events.toLocaleString()})`
              : missing
                ? ' (missing)'
                : '';
          const custom = style.sampleLabels[r.id];
          const name = custom ?? truncate(r.label, Math.max(4, labelChars - count.length));
          const color = ridgeColor(style, r.id, i);
          return (
            <g key={r.id}>
              {style.showLabels && (
                <text
                  x={labelW - 8}
                  y={base - 3}
                  textAnchor="end"
                  className="ridge-label"
                  style={{ fontSize: style.labelFontSize }}
                >
                  <title>{r.sampleIds.map((id) => ws.samples[id]?.relativePath).join('\n')}</title>
                  {name}
                  {count}
                </text>
              )}
              {band && <path d={band} fill={color} fillOpacity={style.fillOpacity * 0.45} stroke="none" />}
              {h && (
                <path
                  d={d}
                  fill={color}
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
        events in the population.{' '}
        {combine.enabled &&
          `Combined ridges ${
            combine.method === 'mean'
              ? 'average the replicates’ unit-area histograms'
              : 'pool the replicates’ events'
          }; n sums the replicates${
            combine.method === 'mean' && combine.band !== 'none'
              ? `; the band is ±${combine.band.toUpperCase()} per bin`
              : ''
          }. `}
        Combine replicates in the panel below the populations; customise colours, labels, order and axes in
        the panel on the right.
      </p>
    </div>
  );
}
