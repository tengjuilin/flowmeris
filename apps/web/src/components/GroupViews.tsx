import type { HistogramResponse } from '@flowmeris/engine';
import type { AxisSpec, Group, PlotSpec } from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import { axisTicks } from '@flowmeris/transforms';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { lineageKey } from '../lib/analysis.ts';
import { defaultAxis } from '../lib/defaults.ts';
import { download, safeName } from '../lib/download.ts';
import { scaleFor } from '../lib/geometry.ts';
import { contextFor, useGroup, useStore } from '../state/store.ts';
import { PlotCanvas } from './PlotCanvas.tsx';
import { usePlotForPopulation } from './PlotPanel.tsx';
import { useSize } from './hooks.ts';

function truncate(s: string, n: number): string {
  const base = s.replace(/\.(fcs|lmd)$/i, '');
  return base.length <= n ? base : `…${base.slice(base.length - n + 1)}`;
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
}: { group: Group; sampleId: string; plot: PlotSpec; size: number }) {
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
        <span>{s?.fileName}</span>
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
  const ws = useStore((s) => s.ws);
  const group = useGroup();
  const plot = usePlotForPopulation();
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
        <span>
          <strong>{pop?.name}</strong> · {plot.kind} · {plot.x.channel}
          {plot.y && plot.kind !== 'histogram' ? ` × ${plot.y.channel}` : ''} · {group.sampleIds.length}{' '}
          samples
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
        gate. Click a tile to edit that sample.
      </p>
      <div
        className="tiles"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, Math.floor((width - 16) / (tile + 12)))}, ${tile}px)`,
        }}
      >
        {group.sampleIds.map((id) => (
          <Tile key={id} group={group} sampleId={id} plot={plot} size={tile} />
        ))}
      </div>
      {ws.groups.length === 0 && null}
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
  const group = useGroup();
  const plot = usePlotForPopulation();
  const box = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { width } = useSize(box);
  const [channel, setChannel] = useState<string | null>(null);
  const [overlap, setOverlap] = useState(0.6);
  const [data, setData] = useState<Record<string, HistogramResponse>>({});

  const ch = channel ?? plot?.x.channel ?? group?.channels[0] ?? '';
  const axis: AxisSpec | null = useMemo(() => {
    if (!group) return null;
    if (plot && plot.x.channel === ch) return plot.x;
    if (plot?.y && plot.y.channel === ch) return plot.y;
    return group.axisDefaults[ch] ?? null;
  }, [group, plot, ch]);

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
            group.sampleIds.map((s) => lineageKey(ws, group, s, ui.popId)),
            axis,
            ws.transforms[axis.transform],
          ])
        : '',
    [group, axis, ws, ui.popId],
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
    for (const sid of group.sampleIds) {
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
  const n = group.sampleIds.length;
  const labelW = 240;
  const W = Math.max(400, width - 24);
  const pw = W - labelW - 20;
  const rowH = Math.max(18, Math.min(60, 600 / n));
  const H = rowH * (n - 1) + rowH / (1 - overlap) + 60;
  const X = (v: number) => labelW + ((v - axis.range[0]) / (axis.range[1] - axis.range[0])) * pw;
  let ticks: ReturnType<typeof axisTicks> = [];
  try {
    const s = scaleFor(ws, axis.transform);
    ticks = axisTicks(s.def, s.apply, s.inverse, axis.range[0], axis.range[1]);
  } catch {
    /* ignore */
  }
  const pop = group.template.populations[ui.popId];
  const sample0 = ws.samples[group.sampleIds[0] ?? ''];
  const marker = sample0?.channels.find((c) => c.pnn === ch)?.pns;

  return (
    <div className="ridge-view" ref={box}>
      <div className="toolbar">
        <label className="field">
          Channel
          <select value={ch} onChange={(e) => setChannel(e.target.value)}>
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
        <label className="field">
          Overlap
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={overlap}
            onChange={(e) => setOverlap(Number(e.target.value))}
          />
        </label>
        <span className="muted">Population: {pop?.name}</span>
        <div className="spacer" />
        <button
          type="button"
          onClick={() => {
            if (!svgRef.current) return;
            const c = svgRef.current.cloneNode(true) as SVGSVGElement;
            c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            download(
              `${safeName(`${group.name}_${pop?.name}_${ch}_ridge`)}.svg`,
              new XMLSerializer().serializeToString(c),
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
      >
        <rect width={W} height={H} fill="var(--surface)" />
        {group.sampleIds.map((sid, i) => {
          const h = data[sid];
          const base = 20 + rowH * i + rowH / (1 - overlap);
          const amp = rowH / (1 - overlap);
          const s = ws.samples[sid];
          let d = '';
          if (h) {
            d = `M${X(h.centers[0]!)},${base}`;
            for (let k = 0; k < h.centers.length; k++)
              d += `L${X(h.centers[k]!)},${base - h.heights[k]! * amp}`;
            d += `L${X(h.centers[h.centers.length - 1]!)},${base}Z`;
          }
          return (
            <g key={sid}>
              <text x={labelW - 8} y={base - 3} textAnchor="end" className="ridge-label">
                <title>{s?.relativePath}</title>
                {truncate(s?.fileName ?? '', 26)}
                {h ? ` (n=${h.eventsPlotted.toLocaleString()})` : ui.missing[sid] ? ' (missing)' : ''}
              </text>
              {h && (
                <path
                  d={d}
                  fill={CATEGORICAL[0]}
                  fillOpacity={0.55}
                  stroke="var(--surface)"
                  strokeWidth={1.25}
                />
              )}
              <line x1={labelW} x2={labelW + pw} y1={base} y2={base} className="ridge-base" />
            </g>
          );
        })}
        <g className="axis" transform={`translate(0,${H - 34})`}>
          {ticks.map((t, i) => (
            <g key={i} transform={`translate(${X(t.pos)},0)`}>
              <line y2={t.major ? 6 : 3} />
              {t.label && (
                <text y={18} textAnchor="middle">
                  {t.label}
                </text>
              )}
            </g>
          ))}
          <text x={labelW + pw / 2} y={32} textAnchor="middle" className="axis-title">
            {marker ? `${marker} :: ${ch}` : ch}
          </text>
        </g>
      </svg>
      <p className="muted small">
        Each curve is a histogram normalised to its own mode (smoothed, σ = 1.5 bins); n is the number of
        events in the population.
      </p>
    </div>
  );
}
