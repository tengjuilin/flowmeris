import type { HistogramResponse } from '@flowmeris/engine';
import type { Group, PlotSpec } from '@flowmeris/model';
import { axisTicks, formatLinear } from '@flowmeris/transforms';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { lineageKey } from '../lib/analysis.ts';
import { factoryAxis, newTilePlot } from '../lib/defaults.ts';
import { exportSvgFigure } from '../lib/exportPlot.ts';
import { scaleFor } from '../lib/geometry.ts';
import { type RidgeCurve, combineCounts, textMeasure, withRidgeChannel, wrapText } from '../lib/ridge.ts';
import {
  contextFor,
  toast,
  useGroup,
  useSampleNames,
  useSelectedSampleIds,
  useStore,
} from '../state/store.ts';
import { ExportMenu } from './ExportMenu.tsx';
import { AxisEditor, type Panel, Section } from './Inspector.tsx';
import { type Anchor, PickerMenu, channelOptions, pickerTrigger } from './PickerMenu.tsx';
import { PlotCanvas } from './PlotCanvas.tsx';
import {
  EditScopeToggle,
  PlotKindSelect,
  ToolButtons,
  axisChannelSetter,
  drill,
  tilesEdit,
} from './PlotPanel.tsx';
import { PopulationTree } from './PopulationTree.tsx';
import { fontStack, ridgeColor, textCss, useRidge } from './RidgeInspector.tsx';
import { SupLabel } from './SupLabel.tsx';
import { useSize } from './hooks.ts';

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
      <div className="tile-title" title={s?.relativePath}>
        <span>{name}</span>
        {ov && <span className="badge warn">override</span>}
        <button
          type="button"
          className="icon"
          title="Open in the Gate view"
          aria-label={`Open ${name} in the Gate view`}
          onClick={() => setUi({ sampleId, view: 'gate' })}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3.5 12.5V3.5h13v13h-9" />
            <path d="M3.5 16.5l7-7M7 9.5h3.5V13" />
          </svg>
        </button>
      </div>
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
              onPickChannel={axisChannelSetter(group, plot, tilesEdit(group.id, plot.id))}
            />
          </div>
        )}
      </div>
    </div>
  );
});

/** The Tiles plot's type, then each axis's channel, scale and range, as the same cards as the Gate view's settings. */
function TilesPlotCard({ group, plot }: { group: Group; plot: PlotSpec }) {
  // Every card starts open; collapsing one lasts for the session.
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const panel: Panel = {
    isOpen: (id) => !closed[id],
    toggle: (id) => setClosed((c) => ({ ...c, [id]: !c[id] })),
  };
  return (
    <div className="ridge-inspector tiles-plot" aria-label="Tiles plot settings">
      <Section id="plot" title="Plot" open={panel.isOpen('plot')} onToggle={() => panel.toggle('plot')}>
        <PlotKindSelect group={group} plot={plot} edit={tilesEdit(group.id, plot.id)} label="Plot type" />
      </Section>
      <AxisEditor tiles which="x" plot={plot} panel={panel} />
      {plot.kind !== 'histogram' && plot.y && <AxisEditor tiles which="y" plot={plot} panel={panel} />}
    </div>
  );
}

/** The Tiles plot of the population being gated; made from the Gate view's plot on first visit. */
function useTilePlot(group: Group | undefined): PlotSpec | undefined {
  const popId = useStore((s) => s.ui.popId);
  const plot = group?.tilePlots.find((p) => p.population === popId);
  const missing = !!group && !plot && !!group.template.populations[popId];
  useEffect(() => {
    if (!missing || !group) return;
    useStore.getState().mutateQuiet((w) => {
      const g = w.groups.find((x) => x.id === group.id);
      if (g && !g.tilePlots.some((p) => p.population === popId)) newTilePlot(w, g, popId);
    });
  }, [missing, group, popId]);
  return plot;
}

export function TilesView() {
  const group = useGroup();
  const plot = useTilePlot(group);
  const names = useSampleNames(group);
  const shown = useSelectedSampleIds(group);
  const [tile, setTile] = useState(280);
  // Re-lay out and re-render the tiles once the slider settles, not on every step of a drag.
  // Tiles resize live; their plots are recomputed at the new size once the slider settles.
  const renderSize = useSettled(tile, 150);
  if (!group || !plot)
    return (
      <div className="empty">Open a population first; tiles show its plot for every sample in the group.</div>
    );
  return (
    <div className="tiles-view">
      <div className="toolbar">
        <ToolButtons is1d={plot.kind === 'histogram'} />
        <EditScopeToggle />
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
      {shown.length === 0 && <div className="empty">No samples selected: check some in the sidebar.</div>}
      {/* The population card floats top-right: tiles flow beside it, then use the full width below it. */}
      <div className="tiles">
        <div className="tiles-side">
          <TilesPlotCard group={group} plot={plot} />
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

/** Card above the population tree: export the ridge plot figure. */
export function RidgeExportCard() {
  const ui = useStore((s) => s.ui);
  const { group, ch } = useRidge();
  if (!group) return null;
  const pop = group.template.populations[ui.popId];
  return (
    <ExportMenu
      className="side-export"
      onExport={(format, dpi) => {
        const svg = document.querySelector<SVGSVGElement>('.ridge-view svg.ridge');
        return svg ? exportSvgFigure(svg, format, `${group.name}_${pop?.name}_${ch}_ridge`, dpi) : undefined;
      }}
    />
  );
}

export function RidgeView() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const mutate = useStore((s) => s.mutate);
  const { group, style, combine, overlap, ch, axis, rows, update } = useRidge();
  const sampleIds = useMemo(() => rows.flatMap((r) => r.sampleIds), [rows]);
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const [data, setData] = useState<Record<string, HistogramResponse>>({});
  const [chMenu, setChMenu] = useState<Anchor | null>(null);
  const closeChMenu = useCallback(() => setChMenu(null), []);

  useEffect(() => {
    // Give the ridge plot its own axis, seeded from the channel's built-in default.
    if (group && !axis && ch) update('Default ridge axis', () => {});
  }, [group, axis, ch, update]);

  const key = useMemo(
    () =>
      group && axis
        ? JSON.stringify([
            [...sampleIds].sort().map((s) => lineageKey(ws, group, s, ui.popId)),
            axis,
            ws.transforms[axis.transform],
            [style.bins, style.smoothing],
          ])
        : '',
    [group, sampleIds, axis, ws, ui.popId],
  );
  useEffect(() => {
    if (!group || !axis) return;
    let live = true;
    const ctx = contextFor(ws, group);
    // Counts, so replicates can be combined; each ridge is scaled to its mode below.
    const hist = {
      histBins: style.bins,
      histNorm: 'count' as const,
      histSmooth: style.smoothing > 0,
      histSigmaBins: style.smoothing,
    };
    setData({});
    for (const sid of sampleIds) {
      if (ui.missing[sid]) continue;
      pool
        .histogram(ctx, sid, ui.popId, axis, hist as unknown as PlotSpec['style'])
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
  // Label text per ridge: the name (custom or sample name) plus the event count, on one line or two.
  const measure = textMeasure(
    style.labelFontSize,
    fontStack(style.labelText.fontFamily ?? style.fontFamily),
    style.labelText,
  );
  const labelText = rows.map((r) => {
    const h = curves[r.id];
    const missing = r.sampleIds.every((id) => ui.missing[id]);
    const reps = r.sampleIds.length > 1 || combine.enabled ? `${r.sampleIds.length}×, ` : '';
    const count = !style.showCounts
      ? ''
      : h
        ? ` (${reps}n=${h.events.toLocaleString()})`
        : missing
          ? ' (missing)'
          : '';
    const split = style.countOnNewLine && count !== '';
    const name = style.sampleLabels[r.id] ?? r.label;
    return { name: split ? name : name + count, count: split ? count.trim() : '' };
  });
  const labelW = !style.showLabels
    ? 20
    : style.labelOverflow === 'widen'
      ? Math.ceil(Math.max(0, ...labelText.flatMap((t) => [measure(t.name), measure(t.count)]))) + 16
      : style.labelWidth;
  const labelLines = labelText.map((t) =>
    !style.showLabels
      ? []
      : style.labelOverflow === 'widen'
        ? [t.name, t.count].filter(Boolean)
        : [
            ...wrapText(t.name, labelW - 16, measure),
            ...(t.count ? wrapText(t.count, labelW - 16, measure) : []),
          ],
  );
  const lineH = style.labelFontSize * 1.15;
  // Room above the first ridge for a label that runs up from its baseline.
  const topPad = Math.max(0, (labelLines[0]?.length ?? 0) * lineH - 23);
  const W = style.width ?? Math.max(400, width - 24);
  const pw = Math.max(50, W - labelW - 20);
  const tickLabelY = style.tickFontSize + 7;
  const pop = group.template.populations[ui.popId];
  const sample0 = ws.samples[group.sampleIds[0] ?? ''];
  const marker = sample0?.channels.find((c) => c.pnn === ch)?.pns;
  const title = (style.axisTitle ?? (marker ? `${marker} :: ${ch}` : ch)).trim();
  const titleY = (style.showTickLabels ? tickLabelY : 6) + style.titleFontSize + 2;
  const belowAxis = (title ? titleY : style.showTickLabels ? tickLabelY : 6) + 6;
  // With a fixed aspect ratio the figure height is set and the row pitch is derived to fill it.
  const rowH = style.aspect
    ? Math.max(4, (W / style.aspect - 26 - topPad - belowAxis) / (n - 1 + 1 / (1 - overlap)))
    : (style.rowHeight ?? Math.max(18, Math.min(60, 600 / n)));
  const amp = rowH / (1 - overlap);
  const axisY = 20 + topPad + rowH * (n - 1) + amp + 6;
  const H = axisY + belowAxis;
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
  const setChannel = (c: string) =>
    update('Ridge channel', (l, w, g) => {
      withRidgeChannel(l, () => {
        l.axis = factoryAxis(w, g, c);
      });
    });

  return (
    <div className="ridge-view" ref={box}>
      <svg
        width={W}
        height={H}
        className="ridge"
        role="img"
        aria-label={`Ridge plot of ${ch} for ${pop?.name}`}
        style={{ fontFamily: fontStack(style.fontFamily) }}
      >
        <rect width={W} height={H} fill="var(--surface)" />
        {rows.map((r, i) => {
          const h = curves[r.id];
          const base = 20 + topPad + rowH * i + amp;
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
          const lines = labelLines[i] ?? [];
          const lx =
            style.labelAlign === 'start' ? 8 : style.labelAlign === 'middle' ? labelW / 2 : labelW - 8;
          const color = ridgeColor(style, r.id, i);
          return (
            <g key={r.id}>
              {style.showLabels && (
                <text
                  x={lx}
                  y={base - 3 - (lines.length - 1) * lineH}
                  textAnchor={style.labelAlign}
                  className="ridge-label"
                  style={{
                    fontSize: style.labelFontSize,
                    ...textCss(style.labelText, style.fontFamily, style.fontColor),
                  }}
                >
                  <title>{r.sampleIds.map((id) => ws.samples[id]?.relativePath).join('\n')}</title>
                  {lines.map((line, k) => (
                    <tspan key={k} x={lx} dy={k === 0 ? 0 : lineH}>
                      {line}
                    </tspan>
                  ))}
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
              <line
                x1={labelW}
                x2={labelW + pw}
                y1={base}
                y2={base}
                className="ridge-base"
                style={style.baselineColor ? { stroke: style.baselineColor } : undefined}
              />
            </g>
          );
        })}
        <g className="axis" transform={`translate(0,${axisY})`}>
          {ticks.map((t, i) => (
            <g key={i} transform={`translate(${X(t.pos)},0)`}>
              <line y2={t.major ? 6 : 3} style={style.axisColor ? { stroke: style.axisColor } : undefined} />
              {style.showTickLabels && t.label && (
                <text
                  y={tickLabelY}
                  textAnchor="middle"
                  style={{
                    fontSize: style.tickFontSize,
                    ...textCss(style.tickText, style.fontFamily, style.fontColor),
                  }}
                >
                  <SupLabel label={t.label} fontSize={style.tickFontSize} />
                </text>
              )}
            </g>
          ))}
          {title && (
            <text
              x={labelW + pw / 2}
              y={titleY}
              textAnchor="middle"
              className="axis-title pickable"
              style={{
                fontSize: style.titleFontSize,
                ...textCss(style.titleText, style.fontFamily, style.fontColor),
              }}
              {...pickerTrigger(`X axis: ${title}. Change channel`, setChMenu)}
            >
              {title}
            </text>
          )}
        </g>
      </svg>
      <p className="muted small">
        Population: {pop?.name}
        {sampleIds.length < group.sampleIds.length &&
          ` · ${sampleIds.length} of ${group.sampleIds.length} samples (sidebar selection)`}
        {combine.enabled &&
          ` · replicates combined (${combine.method === 'mean' ? 'average of curves' : 'pooled events'})`}
      </p>
      {chMenu && (
        <PickerMenu
          anchor={chMenu}
          title="Channel"
          options={channelOptions(group, sample0)}
          value={ch}
          onPick={setChannel}
          onClose={closeChMenu}
        />
      )}
      <p className="muted small">
        Each curve is a histogram normalised to its own mode (smoothed, σ = {style.smoothing} bins); n is the
        number of events in the population.{' '}
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
