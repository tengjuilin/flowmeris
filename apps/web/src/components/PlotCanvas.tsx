import type { HistogramResponse, RasterResponse } from '@flowmeris/engine';
import { ellipseAxes, ellipseFromAxes, spiderRegion, validateSpider } from '@flowmeris/gating';
import {
  type AxisSpec,
  type Gate,
  type Geometry,
  type Group,
  type PlotSpec,
  type Region,
  type Workspace,
  effectiveGeometry,
  isOverridden,
  populationsOfGate,
} from '@flowmeris/model';
import { axisTicks, formatLinear } from '@flowmeris/transforms';
import {
  type PointerEvent as RPointerEvent,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { pool } from '../engine-client/pool.ts';
import type { PlotHandle, PlotMargin } from '../lib/export/plot.ts';
import { DEFAULT_FIGURE, figureText } from '../lib/figure.ts';
import {
  type DimMap,
  type Pt,
  dimMap,
  gateMatchesAxes,
  outlineGateSpace,
  pointInPolygonPx,
  rayEnd,
  scaleFor,
} from '../lib/geometry.ts';
import { lineageKey, plotKey } from '../lib/keys.ts';
import { createGate, deleteGate, setGateGeometry, setLabelOffset } from '../state/commands/gates.ts';
import { contextFor, useStore } from '../state/store.ts';
import { type Anchor, PickerMenu, channelOptions, pickerTrigger } from './PickerMenu.tsx';

/** Where each quadrant / spider region's percentage label sits in a pw × ph plot. */
const QUAD_CORNERS: Partial<Record<Region, (pw: number, ph: number) => [number, number, 'start' | 'end']>> = {
  Q1: () => [6, 14, 'start'],
  Q2: (pw) => [pw - 6, 14, 'end'],
  Q3: (pw, ph) => [pw - 6, ph - 8, 'end'],
  Q4: (_pw, ph) => [6, ph - 8, 'start'],
};

interface Props {
  ws: Workspace;
  group: Group;
  sampleId: string;
  plot: PlotSpec;
  /** Space available; a fixed box aspect ratio (figure `boxAspect`) may use less of it. */
  width: number;
  height: number;
  interactive?: boolean;
  compact?: boolean;
  /** Hide the off-scale / non-positive event note below the plot. */
  hideOffScaleNote?: boolean;
  /** Called when a population is double-clicked (drill-down). */
  onDrill?: (popId: string) => void;
  /** Emphasise the gate producing this population and dim the plot's other gates. */
  focusPopId?: string;
  /** Overlay a descendant population's events in its colour (backgating). */
  backgate?: { popId: string; color: string };
  /**
   * Overlay other samples' events, each in its colour; `sampleId` is then drawn as dots (2D) or an
   * outline (histogram) in `color`. Gates and their percentages stay those of `sampleId`.
   */
  overlay?: { color: string; samples: { sampleId: string; color: string }[] };
  /** Makes the axis titles clickable, to pick another channel for that axis. */
  onPickChannel?: (axis: 'x' | 'y', channel: string) => void;
  /** Makes a histogram's y-axis title clickable, to pick what the y axis shows. */
  onPickHistNorm?: (norm: HistNorm) => void;
}

type HistNorm = PlotSpec['style']['histNorm'];

/** What a histogram's y axis can show: FlowJo's Count, Normalized to Mode and Unit Area. */
const HIST_NORMS: { value: HistNorm; label: string; detail: string }[] = [
  { value: 'count', label: 'Count', detail: 'events per bin' },
  { value: 'mode', label: '% of max', detail: 'normalised to mode' },
  { value: 'area', label: 'Fraction', detail: 'unit area' },
];

type Drag =
  | { kind: 'create'; tool: 'rect' | 'range' | 'ellipse'; start: [number, number]; cur: [number, number] }
  | { kind: 'move'; gateId: string; start: [number, number]; base: Geometry }
  | { kind: 'handle'; gateId: string; handle: string; base: Geometry }
  /** A population's label, its offset in fractions of the plot size. */
  | { kind: 'label'; popId: string; start: [number, number]; base: [number, number]; cur: [number, number] };

const SPAN = 1e6;

function translate(g: Geometry, dx: number, dy: number): Geometry {
  switch (g.kind) {
    case 'rect':
      return {
        ...g,
        min: g.min.map((v, i) => (v === null ? null : v + (i === 0 ? dx : dy))),
        max: g.max.map((v, i) => (v === null ? null : v + (i === 0 ? dx : dy))),
      };
    case 'polygon':
      return { ...g, vertices: g.vertices.map(([x, y]) => [x + dx, y + dy]) };
    case 'ellipse':
      return { ...g, mean: [g.mean[0] + dx, g.mean[1] + dy] };
    case 'quadrant':
      return { ...g, center: [g.center[0] + dx, g.center[1] + dy] };
    case 'spider':
      return {
        ...g,
        center: [g.center[0] + dx, g.center[1] + dy],
        arms: g.arms.map(([x, y]) => [x + dx, y + dy]) as typeof g.arms,
      };
    case 'split':
      return { ...g, at: g.at + dx };
  }
}

/**
 * Margins, plot area (pw × ph) and overall size of `plot` drawn in `availWidth` × `availHeight`:
 * a fixed box aspect ratio (figure `boxAspect`) may use less than the space available.
 */
export function plotBox(plot: PlotSpec, availWidth: number, availHeight: number, compact = false) {
  const fig = plot.style.figure ?? DEFAULT_FIGURE;
  // Text positions and margins follow the font sizes.
  const tickY = 7 + fig.tickFontSize;
  const xTitleY = (fig.showTickLabels ? tickY : 4) + 10 + fig.axisTitleFontSize;
  const yTitleX = -(fig.showTickLabels ? 19 + 3 * fig.tickFontSize : 14);
  const title = fig.title?.trim();
  const margin: PlotMargin = compact
    ? { l: 6, r: 4, t: 4, b: 6 }
    : {
        l: -yTitleX + fig.axisTitleFontSize + 2,
        r: 14,
        t: title ? 14 + fig.titleFontSize * 1.4 : 14,
        b: xTitleY + 8,
      };
  let pw = Math.max(10, availWidth - margin.l - margin.r);
  let ph = Math.max(10, availHeight - margin.t - margin.b);
  // A fixed box aspect ratio shrinks the plot area to the largest box of that shape that fits.
  if (fig.boxAspect) {
    if (pw / ph > fig.boxAspect) pw = Math.max(10, ph * fig.boxAspect);
    else ph = Math.max(10, pw / fig.boxAspect);
  }
  const width = fig.boxAspect ? pw + margin.l + margin.r : availWidth;
  const height = fig.boxAspect ? ph + margin.t + margin.b : availHeight;
  return { margin, pw, ph, width, height, tickY, xTitleY, yTitleX, title };
}

export const PlotCanvas = forwardRef<PlotHandle, Props>(function PlotCanvas(
  {
    ws,
    group,
    sampleId,
    plot,
    width: availWidth,
    height: availHeight,
    interactive = false,
    compact = false,
    hideOffScaleNote = false,
    onDrill,
    focusPopId,
    backgate,
    overlay,
    onPickChannel,
    onPickHistNorm,
  },
  ref,
) {
  // Narrow subscriptions: a plot (e.g. each of many tiles) re-renders only when what it shows changes.
  const missingMap = useStore((s) => s.ui.missing);
  const tool = useStore((s) => (interactive ? s.ui.tool : 'select'));
  const selectedGateId = useStore((s) => (interactive ? s.ui.selectedGateId : null));
  const setUi = useStore((s) => s.setUi);
  const fig = plot.style.figure ?? DEFAULT_FIGURE;
  const { margin, pw, ph, width, height, tickY, xTitleY, yTitleX, title } = plotBox(
    plot,
    availWidth,
    availHeight,
    compact,
  );
  const is1d = plot.kind === 'histogram' || !plot.y;
  const xr = plot.x.range;
  const yr = plot.y?.range ?? [0, 1];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [raster, setRaster] = useState<RasterResponse | null>(null);
  const [hist, setHist] = useState<HistogramResponse | null>(null);
  const [bgRaster, setBgRaster] = useState<RasterResponse | null>(null);
  const [bgHist, setBgHist] = useState<{ sub: Float64Array; base: Float64Array } | null>(null);
  const [ovHists, setOvHists] = useState<{ color: string; heights: Float64Array }[]>([]);
  const ovCanvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<{ gateId: string; geom: Geometry } | null>(null);
  const [poly, setPoly] = useState<[number, number][] | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [counts, setCounts] = useState<Record<string, { count: number; parent: number }>>({});
  const [preview, setPreview] = useState<{
    gateId: string;
    parent: number;
    regions: Partial<Record<Region, number>>;
  } | null>(null);
  const [hoverCounts, setHoverCounts] = useState<{
    parent: number;
    regions: Partial<Record<Region, number>>;
  } | null>(null);
  const reqId = useRef(0);
  const clipId = `clip${useId().replace(/:/g, '')}`;

  useImperativeHandle(ref, () => ({ svg: svgRef.current, raster, size: { width, height, margin } }), [
    raster,
    width,
    height,
    margin,
  ]);

  const ctx = useMemo(() => contextFor(ws, group), [ws, group]);
  const key = useMemo(() => plotKey(ws, group, sampleId, plot), [ws, group, sampleId, plot]);
  const dpr = compact ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const missing = !!missingMap[sampleId];
  const ovSamples = useMemo(
    () => (overlay?.samples ?? []).filter((o) => o.sampleId !== sampleId && !missingMap[o.sampleId]),
    [overlay, sampleId, missingMap],
  );
  const ovColor = ovSamples.length ? overlay?.color : undefined;

  // --- data -----------------------------------------------------------------
  // Layout effects, so a result already in the pool's cache (e.g. a tile scrolled back into view)
  // is drawn before the first paint instead of flashing an empty plot.
  useLayoutEffect(() => {
    if (missing) return;
    const id = ++reqId.current;
    const ac = new AbortController();
    const width = Math.round(pw * dpr);
    const height = Math.round(ph * dpr);
    const dotColor =
      ovColor ?? (getComputedStyle(document.documentElement).getPropertyValue('--dot').trim() || '#333333');
    const dataKey = JSON.stringify(
      is1d ? ['hist', key] : ['raster', key, width, height, dotColor, !!ovColor],
    );
    const opts = { key: dataKey, signal: ac.signal };
    const hit = pool.cached<HistogramResponse & RasterResponse>(dataKey);
    if (hit) {
      setError(null);
      setLoading(false);
      if (is1d) setHist(hit);
      else setRaster(hit);
      return;
    }
    setError(null);
    setLoading(true);
    const run = async () => {
      try {
        if (is1d) {
          const h = await pool.histogram(ctx, sampleId, plot.population, plot.x, plot.style, opts);
          if (id === reqId.current) setHist(h);
        } else {
          const r = await pool.raster(
            ctx,
            { sampleId, plot: ovColor ? overlayDots(plot) : plot, width, height, dotColor },
            opts,
          );
          if (id === reqId.current) setRaster(r);
        }
      } catch (e) {
        if (id === reqId.current && !ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    };
    void run();
    return () => ac.abort();
  }, [key, pw, ph, dpr, missing, ovColor]);

  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c || !raster || is1d) return;
    c.width = raster.width;
    c.height = raster.height;
    const g = c.getContext('2d');
    if (!g) return;
    // rgba may be a shared cached result: ImageData only reads it.
    g.putImageData(new ImageData(raster.rgba, raster.width, raster.height), 0, 0);
  }, [raster, is1d]);

  // --- backgating overlay ------------------------------------------------------
  const bgPop = backgate && backgate.popId !== plot.population ? backgate : null;
  const bgKey = useMemo(
    () => (bgPop ? JSON.stringify([key, lineageKey(ws, group, sampleId, bgPop.popId), bgPop.color]) : ''),
    [bgPop?.popId, bgPop?.color, key, ws, group, sampleId],
  );
  useEffect(() => {
    setBgRaster(null);
    setBgHist(null);
    if (!bgPop || missing) return;
    let live = true;
    const run = async () => {
      if (is1d) {
        // Both in counts so the overlay can be put on the base histogram's normalisation:
        // smoothing and every normalisation are linear, so one factor maps counts to heights.
        const style = { ...plot.style, histNorm: 'count' as const };
        const [base, sub] = await Promise.all([
          pool.histogram(ctx, sampleId, plot.population, plot.x, style, { key: `${bgKey}|base` }),
          pool.histogram(ctx, sampleId, bgPop.popId, plot.x, style, { key: `${bgKey}|sub` }),
        ]);
        if (live) setBgHist({ sub: sub.heights, base: base.heights });
      } else {
        const req = {
          sampleId,
          plot: {
            ...plot,
            population: bgPop.popId,
            kind: 'dot' as const,
            style: { ...plot.style, pointPx: Math.max(2, plot.style.pointPx) },
          },
          width: Math.round(pw * dpr),
          height: Math.round(ph * dpr),
          dotColor: bgPop.color,
        };
        const r = await pool.raster(ctx, req, { key: `${bgKey}|raster|${req.width}|${req.height}` });
        if (live) setBgRaster(r);
      }
    };
    run().catch(() => {});
    return () => {
      live = false;
    };
  }, [bgKey, pw, ph, dpr, missing]);

  useEffect(() => {
    const c = bgCanvasRef.current;
    if (!c || !bgRaster || is1d) return;
    c.width = bgRaster.width;
    c.height = bgRaster.height;
    const g = c.getContext('2d');
    if (!g) return;
    g.putImageData(new ImageData(bgRaster.rgba, bgRaster.width, bgRaster.height), 0, 0);
  }, [bgRaster, is1d]);

  // --- overlaid samples ----------------------------------------------------------
  const ovKey = useMemo(
    () =>
      JSON.stringify([
        plot,
        ws.transforms[plot.x.transform],
        plot.y ? ws.transforms[plot.y.transform] : null,
        ovSamples.map((o) => [lineageKey(ws, group, o.sampleId, plot.population), o.color]),
      ]),
    [plot, ws, group, ovSamples],
  );
  useEffect(() => {
    setOvHists([]);
    const c = ovCanvasRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    if (ovSamples.length === 0) return;
    let live = true;
    const run = async () => {
      if (is1d) {
        const hs = await Promise.all(
          ovSamples.map((o) => pool.histogram(ctx, o.sampleId, plot.population, plot.x, plot.style)),
        );
        if (live) setOvHists(hs.map((h, i) => ({ color: ovSamples[i]!.color, heights: h.heights })));
        return;
      }
      const w = Math.round(pw * dpr);
      const h = Math.round(ph * dpr);
      const rs = await Promise.all(
        ovSamples.map((o) =>
          pool.raster(ctx, {
            sampleId: o.sampleId,
            plot: overlayDots(plot),
            width: w,
            height: h,
            dotColor: o.color,
          }),
        ),
      );
      const c = ovCanvasRef.current;
      const g = c?.getContext('2d');
      if (!live || !c || !g) return;
      c.width = w;
      c.height = h;
      // Composite through a scratch canvas: putImageData would overwrite rather than blend.
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      const tg = tmp.getContext('2d')!;
      for (const r of rs) {
        tg.putImageData(new ImageData(r.rgba, r.width, r.height), 0, 0);
        g.drawImage(tmp, 0, 0);
      }
    };
    run().catch(() => {});
    return () => {
      live = false;
    };
  }, [ovKey, pw, ph, dpr]);

  // --- gates on this plot ----------------------------------------------------
  const gates = useMemo(
    () =>
      Object.values(group.template.gates).filter(
        (g) => g.parentPop === plot.population && gateMatchesAxes(g, plot.x, is1d ? undefined : plot.y),
      ),
    [group, plot, is1d],
  );
  const gatePops = useMemo(
    () => gates.flatMap((g) => populationsOfGate(group.template, g.id)),
    [gates, group],
  );
  const countsKey = useMemo(
    () => JSON.stringify(gatePops.map((p) => lineageKey(ws, group, sampleId, p.id))),
    [gatePops, ws, group, sampleId],
  );
  useEffect(() => {
    if (missing || gatePops.length === 0) {
      setCounts({});
      return;
    }
    let live = true;
    const ac = new AbortController();
    const popIds = gatePops.map((p) => p.id);
    pool
      .counts(ctx, sampleId, popIds, {
        key: JSON.stringify(['counts', popIds, countsKey]),
        signal: ac.signal,
      })
      .then((cs) => {
        if (!live) return;
        setCounts(Object.fromEntries(cs.map((c) => [c.popId, { count: c.count, parent: c.parentCount }])));
      })
      .catch(() => {});
    return () => {
      live = false;
      ac.abort();
    };
  }, [countsKey, sampleId, missing]);

  // --- coordinate helpers ------------------------------------------------------
  const X = useCallback((v: number) => ((v - xr[0]) / (xr[1] - xr[0])) * pw, [xr, pw]);
  const Y = useCallback((v: number) => ph - ((v - yr[0]) / (yr[1] - yr[0])) * ph, [yr, ph]);
  const toData = (px: number, py: number): [number, number] => [
    xr[0] + (px / pw) * (xr[1] - xr[0]),
    yr[0] + ((ph - py) / ph) * (yr[1] - yr[0]),
  ];
  const evPt = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left - margin.l, e.clientY - r.top - margin.t];
  };

  /** Clamp a data point to the plotted range (spider arm handles stay inside the plot). */
  const clampPt = (p: readonly [number, number]): [number, number] => [
    Math.min(Math.max(p[0], Math.min(xr[0], xr[1])), Math.max(xr[0], xr[1])),
    Math.min(Math.max(p[1], Math.min(yr[0], yr[1])), Math.max(yr[0], yr[1])),
  ];
  /** Spider arms at the midpoints of the plot's top, right, bottom and left edges. */
  const edgeArms = (): [[number, number], [number, number], [number, number], [number, number]] => {
    const mx = (xr[0] + xr[1]) / 2;
    const my = (yr[0] + yr[1]) / 2;
    return [
      [mx, yr[1]],
      [xr[1], my],
      [mx, yr[0]],
      [xr[0], my],
    ];
  };

  const maps = useCallback(
    (gate: Gate): DimMap[] => gate.dims.map((d, i) => dimMap(ws, d, i === 0 ? plot.x : (plot.y as AxisSpec))),
    [ws, plot],
  );
  const geomOf = (gate: Gate): Geometry =>
    draft?.gateId === gate.id ? draft.geom : effectiveGeometry(group, gate.id, sampleId);

  // --- preview counts while editing -----------------------------------------------
  // At most one preview is in flight; edits made meanwhile collapse into the latest
  // one, so a slow worker never builds up a queue of stale drag positions.
  const previewTimer = useRef<number | null>(null);
  // Bumped when a drag ends, so a preview still in flight cannot reappear afterwards.
  const previewEpoch = useRef(0);
  const previewBusy = useRef(false);
  const previewNext = useRef<(() => void) | null>(null);
  const schedulePreview = (gate: Gate, geom: Geometry) => {
    if (previewTimer.current) cancelAnimationFrame(previewTimer.current);
    const epoch = previewEpoch.current;
    previewTimer.current = requestAnimationFrame(() => {
      const send = () => {
        previewBusy.current = true;
        pool
          .preview(ctx, { sampleId, gate: { ...gate, geometry: geom } })
          .then((r) => {
            if (epoch === previewEpoch.current)
              setPreview({ gateId: gate.id, parent: r.parentCount, regions: r.regions });
          })
          .catch(() => {})
          .finally(() => {
            previewBusy.current = false;
            const next = previewNext.current;
            previewNext.current = null;
            next?.();
          });
      };
      if (previewBusy.current) previewNext.current = send;
      else send();
    });
  };

  // --- editing --------------------------------------------------------------------
  const canDraw = interactive && !missing;
  // Gate labels can be dragged off the events they cover on any full-size plot, unless a gate is being drawn.
  const labelsMovable = !compact && !missing && tool === 'select' && !poly;

  // the quadrant / spider / split gate that a click would place now
  const hoverGeom: Extract<Geometry, { kind: 'quadrant' | 'spider' | 'split' }> | null =
    hover && !drag
      ? !is1d && tool === 'quadrant'
        ? { kind: 'quadrant', center: hover }
        : !is1d && tool === 'spider'
          ? { kind: 'spider', center: hover, arms: edgeArms() }
          : is1d && tool === 'split'
            ? { kind: 'split', at: hover[0] }
            : null
      : null;
  const hoverKey = hoverGeom && canDraw ? JSON.stringify(hoverGeom) : '';
  const hoverBusy = useRef(false);
  const hoverNext = useRef<(() => void) | null>(null);
  useEffect(() => {
    setHoverCounts(null);
    if (!hoverKey || !hoverGeom) return;
    let live = true;
    const raf = requestAnimationFrame(() => {
      const send = () => {
        hoverBusy.current = true;
        pool
          .preview(ctx, { sampleId, gate: { ...newGateBase(), id: '__hover', geometry: hoverGeom } })
          .then((r) => live && setHoverCounts({ parent: r.parentCount, regions: r.regions }))
          .catch(() => {})
          .finally(() => {
            hoverBusy.current = false;
            const next = hoverNext.current;
            hoverNext.current = null;
            next?.();
          });
      };
      // Coalesce like schedulePreview: only the newest cursor position waits for the worker.
      if (hoverBusy.current) hoverNext.current = send;
      else send();
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      hoverNext.current = null;
    };
    // hoverKey captures hoverGeom; ctx/sample changes restart the preview
  }, [hoverKey, ctx, sampleId]);

  const commit = (gateId: string, geom: Geometry) => {
    setGateGeometry(group.id, gateId, geom, useStore.getState().ui.editScope, sampleId);
  };

  const newGateBase = (): Omit<Gate, 'id' | 'geometry'> => ({
    parentPop: plot.population,
    dims: is1d
      ? [{ channel: plot.x.channel, comp: plot.x.comp, transform: plot.x.transform }]
      : [
          { channel: plot.x.channel, comp: plot.x.comp, transform: plot.x.transform },
          { channel: plot.y!.channel, comp: plot.y!.comp, transform: plot.y!.transform },
        ],
  });

  const finishCreate = (geometry: Geometry) => {
    const pop = createGate(group.id, { ...newGateBase(), geometry });
    const st = useStore.getState();
    const g = st.ws.groups.find((x) => x.id === group.id)!;
    const gid = g.template.populations[pop]?.gate ?? null;
    setUi({ selectedGateId: gid, tool: 'select' });
  };

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const labelEl = labelsMovable && e.button === 0 && (e.target as Element).closest('[data-label-pop]');
    if (labelEl) {
      // Keep the press from the plot's container too (e.g. panning the tree of plots).
      e.stopPropagation();
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const popId = labelEl.getAttribute('data-label-pop')!;
      const base = group.template.populations[popId]?.labelOffset ?? [0, 0];
      setDrag({ kind: 'label', popId, start: evPt(e), base, cur: base });
      return;
    }
    if (!canDraw || e.button !== 0) return;
    const [px, py] = evPt(e);
    if (px < 0 || py < 0 || px > pw || py > ph) return;
    const p = toData(px, py);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const handleEl = (e.target as Element).closest('[data-handle]');
    if (handleEl) {
      const gateId = handleEl.getAttribute('data-gate')!;
      const handle = handleEl.getAttribute('data-handle')!;
      const gate = group.template.gates[gateId]!;
      const base = geomOf(gate);
      if (handle.startsWith('mid')) {
        // insert polygon vertex at edge midpoint
        if (base.kind === 'polygon') {
          const i = Number(handle.slice(3));
          const v = [...base.vertices];
          v.splice(i + 1, 0, p);
          const ng: Geometry = { ...base, vertices: v };
          setDraft({ gateId, geom: ng });
          setDrag({ kind: 'handle', gateId, handle: `v${i + 1}`, base: ng });
        }
        return;
      }
      setDrag({ kind: 'handle', gateId, handle, base });
      return;
    }
    switch (tool) {
      case 'rect':
      case 'ellipse':
        setDrag({ kind: 'create', tool, start: p, cur: p });
        return;
      case 'range':
        if (is1d) setDrag({ kind: 'create', tool: 'range', start: p, cur: p });
        return;
      case 'split':
        if (is1d) finishCreate({ kind: 'split', at: p[0] });
        return;
      case 'polygon': {
        if (is1d) return;
        if (poly && poly.length >= 3) {
          const f = poly[0]!;
          if (Math.hypot(X(f[0]) - px, Y(f[1]) - py) < 9) {
            finishCreate({ kind: 'polygon', vertices: poly });
            setPoly(null);
            return;
          }
        }
        setPoly([...(poly ?? []), p]);
        return;
      }
      case 'quadrant':
        if (!is1d) finishCreate({ kind: 'quadrant', center: p });
        return;
      case 'spider':
        if (!is1d) {
          finishCreate({ kind: 'spider', center: p, arms: edgeArms() });
        }
        return;
      default: {
        // select / move
        const hit = hitGate(px, py);
        setUi({ selectedGateId: hit?.id ?? null });
        if (hit && maps(hit).every((m) => m.identity))
          setDrag({ kind: 'move', gateId: hit.id, start: p, base: geomOf(hit) });
      }
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const [px, py] = evPt(e);
    const p = toData(px, py);
    // The cursor position only drives the polygon draft and the quadrant / spider preview;
    // tracking it otherwise would re-render the whole plot on every pointer move.
    if (
      poly ||
      ((tool === 'quadrant' || tool === 'spider') && !is1d && canDraw) ||
      (tool === 'split' && is1d && canDraw)
    )
      setHover(px >= 0 && py >= 0 && px <= pw && py <= ph ? p : null);
    else if (hover) setHover(null);
    if (!drag) return;
    if (drag.kind === 'create') {
      setDrag({ ...drag, cur: p });
      return;
    }
    if (drag.kind === 'label') {
      const dx = (px - drag.start[0]) / pw;
      const dy = (py - drag.start[1]) / ph;
      setDrag({ ...drag, cur: [drag.base[0] + dx, drag.base[1] + dy] });
      return;
    }
    const gate = group.template.gates[drag.gateId]!;
    let next: Geometry | null = null;
    if (drag.kind === 'move')
      next = translate(drag.base, p[0] - drag.start[0], is1d ? 0 : p[1] - drag.start[1]);
    else next = applyHandle(drag.base, drag.handle, p);
    // spider points never leave the plot, even when moving the whole gate or one drawn before this rule
    if (next?.kind === 'spider')
      next = { ...next, center: clampPt(next.center), arms: next.arms.map(clampPt) as typeof next.arms };
    if (next) {
      setDraft({ gateId: drag.gateId, geom: next });
      schedulePreview(gate, next);
    }
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.kind === 'label') {
      const moved = drag.cur[0] !== drag.base[0] || drag.cur[1] !== drag.base[1];
      if (moved) setLabelOffset(group.id, drag.popId, drag.cur);
      setDrag(null);
      return;
    }
    if (drag.kind === 'create') {
      const [x0, y0] = drag.start;
      const [x1, y1] = drag.cur;
      const tiny = Math.abs(X(x1) - X(x0)) < 4 && (is1d || Math.abs(Y(y1) - Y(y0)) < 4);
      if (!tiny) {
        if (drag.tool === 'range')
          finishCreate({ kind: 'rect', min: [Math.min(x0, x1)], max: [Math.max(x0, x1)] });
        else if (drag.tool === 'rect')
          finishCreate({
            kind: 'rect',
            min: [Math.min(x0, x1), Math.min(y0, y1)],
            max: [Math.max(x0, x1), Math.max(y0, y1)],
          });
        else {
          const e = ellipseFromAxes(
            (x0 + x1) / 2,
            (y0 + y1) / 2,
            Math.abs(x1 - x0) / 2 || 1e-3,
            Math.abs(y1 - y0) / 2 || 1e-3,
            0,
          );
          finishCreate({ kind: 'ellipse', ...e });
        }
      }
    } else if (draft && draft.gateId === drag.gateId) {
      commit(draft.gateId, draft.geom);
    }
    setDrag(null);
    setDraft(null);
    previewEpoch.current++;
    if (previewTimer.current) cancelAnimationFrame(previewTimer.current);
    previewNext.current = null;
    setPreview(null);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const labelEl = labelsMovable && (e.target as Element).closest('[data-label-pop]');
    if (labelEl) {
      // Put a moved label back in its default place (instead of drilling into the population).
      e.stopPropagation();
      const popId = labelEl.getAttribute('data-label-pop')!;
      if (group.template.populations[popId]?.labelOffset) setLabelOffset(group.id, popId, undefined);
      return;
    }
    if (!interactive) return;
    if (poly && poly.length >= 3) {
      finishCreate({ kind: 'polygon', vertices: poly.slice(0, -1).length >= 3 ? poly.slice(0, -1) : poly });
      setPoly(null);
      return;
    }
    const [px, py] = evPt(e);
    const pop = popAt(px, py);
    if (pop && onDrill) onDrill(pop);
  };

  // keyboard
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (poly) {
        if (e.key === 'Escape') setPoly(null);
        else if (e.key === 'Backspace') setPoly(poly.length > 1 ? poly.slice(0, -1) : null);
        else if (e.key === 'Enter' && poly.length >= 3) {
          finishCreate({ kind: 'polygon', vertices: poly });
          setPoly(null);
        }
        return;
      }
      const sel = selectedGateId ? group.template.gates[selectedGateId] : undefined;
      if (!sel || sel.parentPop !== plot.population) return;
      if (e.key.startsWith('Arrow') && maps(sel).every((m) => m.identity)) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) / pw;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = is1d
          ? 0
          : e.key === 'ArrowUp'
            ? step * (yr[1] - yr[0])
            : e.key === 'ArrowDown'
              ? -step * (yr[1] - yr[0])
              : 0;
        commit(sel.id, translate(effectiveGeometry(group, sel.id, sampleId), dx * (xr[1] - xr[0]), dy));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteGate(group.id, sel.id);
        setUi({ selectedGateId: null });
      } else if (e.key === 'Escape') setUi({ selectedGateId: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function applyHandle(base: Geometry, handle: string, p: [number, number]): Geometry | null {
    switch (base.kind) {
      case 'rect': {
        const min = [...base.min];
        const max = [...base.max];
        if (handle.includes('w')) min[0] = p[0];
        if (handle.includes('e')) max[0] = p[0];
        if (!is1d) {
          if (handle.includes('s')) min[1] = p[1];
          if (handle.includes('n')) max[1] = p[1];
        }
        for (let i = 0; i < min.length; i++) {
          const a = min[i];
          const b = max[i];
          if (a !== null && a !== undefined && b !== null && b !== undefined && a > b) {
            min[i] = b;
            max[i] = a;
          }
        }
        return { ...base, min, max };
      }
      case 'polygon': {
        const i = Number(handle.slice(1));
        const v = base.vertices.map((q, k) => (k === i ? p : q)) as [number, number][];
        return { ...base, vertices: v };
      }
      case 'ellipse': {
        const ax = ellipseAxes(base.mean, base.cov, base.d2);
        const dx = p[0] - ax.cx;
        const dy = p[1] - ax.cy;
        if (handle === 'a') {
          const a = Math.max(1e-4, Math.hypot(dx, dy));
          return { kind: 'ellipse', ...ellipseFromAxes(ax.cx, ax.cy, a, ax.b, Math.atan2(dy, dx)) };
        }
        if (handle === 'b') {
          const b = Math.max(1e-4, Math.abs(-dx * Math.sin(ax.theta) + dy * Math.cos(ax.theta)));
          return { kind: 'ellipse', ...ellipseFromAxes(ax.cx, ax.cy, ax.a, b, ax.theta) };
        }
        return base;
      }
      case 'quadrant':
        return { ...base, center: p };
      case 'spider': {
        // arms stay where they are (inside the plot) while the centre moves
        if (handle === 'c') return { ...base, center: clampPt(p) };
        const i = Number(handle.slice(3));
        const arms = base.arms.map((q, k) => (k === i ? clampPt(p) : q)) as typeof base.arms;
        return validateSpider(base.center, arms) === null ? { ...base, arms } : null;
      }
      case 'split':
        return { ...base, at: p[0] };
    }
  }

  // --- hit testing ----------------------------------------------------------------
  function shapePx(gate: Gate, geom: Geometry): Pt[] {
    const m = maps(gate);
    const dense = !m.every((d) => d.identity);
    const bounds: [[number, number], [number, number]] = [
      [m[0]!.inv(xr[0] - 10), m[0]!.inv(xr[1] + 10)],
      m[1] ? [m[1].inv(yr[0] - 10), m[1].inv(yr[1] + 10)] : [0, 1],
    ];
    return outlineGateSpace(geom, dense, bounds).map(([a, b]) => ({
      x: X(m[0]!.f(a)),
      y: Y(m[1] ? m[1].f(b) : 0),
    }));
  }

  function hitGate(px: number, py: number): Gate | undefined {
    for (const gate of [...gates].reverse()) {
      const geom = geomOf(gate);
      if (geom.kind === 'quadrant' || geom.kind === 'spider') {
        const m = maps(gate);
        const cx = X(m[0]!.f(geom.center[0]));
        const cy = Y(m[1]!.f(geom.center[1]));
        if (Math.hypot(px - cx, py - cy) < 12) return gate;
        continue;
      }
      if (geom.kind === 'split') {
        if (Math.abs(px - X(maps(gate)[0]!.f(geom.at))) < 6) return gate;
        continue;
      }
      if (is1d && geom.kind === 'rect') {
        const m = maps(gate)[0]!;
        const a = X(m.f(geom.min[0] ?? -SPAN));
        const b = X(m.f(geom.max[0] ?? SPAN));
        if (px >= a && px <= b) return gate;
        continue;
      }
      if (pointInPolygonPx(shapePx(gate, geom), { x: px, y: py })) return gate;
    }
    return undefined;
  }

  function popAt(px: number, py: number): string | undefined {
    for (const gate of [...gates].reverse()) {
      const geom = geomOf(gate);
      const pops = populationsOfGate(group.template, gate.id);
      if (geom.kind === 'split') {
        // Either side of the divider is one of the two populations.
        const v = maps(gate)[0]!.inv(toData(px, py)[0]);
        return pops.find((p) => p.region === (v >= geom.at ? 'hi' : 'lo'))?.id;
      }
      if (geom.kind === 'quadrant' || geom.kind === 'spider') {
        const m = maps(gate);
        const [dx, dy] = toData(px, py);
        const gx = m[0]!.inv(dx);
        const gy = m[1]!.inv(dy);
        let r: number;
        if (geom.kind === 'spider') r = spiderRegion(geom.center[0], geom.center[1], geom.arms, gx, gy);
        else r = gy >= geom.center[1] ? (gx >= geom.center[0] ? 2 : 1) : gx >= geom.center[0] ? 3 : 4;
        return pops.find((p) => p.region === `Q${r}`)?.id;
      }
      if (hitGate(px, py)?.id === gate.id) return pops[0]?.id;
    }
    return undefined;
  }

  // --- rendering ----------------------------------------------------------------------
  const xTicks = useMemo(() => {
    try {
      const s = scaleFor(ws, plot.x.transform);
      return fig.xTicks
        ? customTicks(fig.xTicks, s.apply, xr)
        : axisTicks(s.def, s.apply, s.inverse, xr[0], xr[1]);
    } catch {
      return [];
    }
  }, [ws, plot.x.transform, xr, fig.xTicks]);
  const yTicks = useMemo(() => {
    if (is1d || !plot.y) return [];
    try {
      const s = scaleFor(ws, plot.y.transform);
      return fig.yTicks
        ? customTicks(fig.yTicks, s.apply, yr)
        : axisTicks(s.def, s.apply, s.inverse, yr[0], yr[1]);
    } catch {
      return [];
    }
  }, [ws, plot.y, yr, is1d, fig.yTicks]);

  const channelLabel = (a: AxisSpec) => {
    const s = ws.samples[sampleId];
    const ch = s?.channels.find((c) => c.pnn === a.channel);
    return ch?.pns ? `${ch.pns} :: ${a.channel}` : a.channel;
  };
  // A custom axis title replaces the channel label; on a histogram only the x title is customisable.
  const label = (a: AxisSpec) =>
    ((a === plot.x ? fig.xTitle : a === plot.y && !is1d ? fig.yTitle : undefined) ?? channelLabel(a)).trim();
  const tickCss = figureText(fig, fig.tickText, fig.tickFontSize);
  const axisTitleCss = figureText(fig, fig.axisTitleText, fig.axisTitleFontSize);
  const lineCss = { strokeWidth: fig.tickWidth, ...(fig.axisColor ? { stroke: fig.axisColor } : {}) };
  const [axisMenu, setAxisMenu] = useState<{ axis: 'x' | 'y'; anchor: Anchor } | null>(null);
  const closeAxisMenu = useCallback(() => setAxisMenu(null), []);
  const histNormTitle = HIST_NORMS.find((o) => o.value === plot.style.histNorm)?.label ?? 'Count';
  const axisTitle = (axis: 'x' | 'y') =>
    is1d && axis === 'y'
      ? onPickHistNorm
        ? {
            className: 'axis-title pickable',
            ...pickerTrigger(`Y axis: ${histNormTitle}. Change what the y axis shows`, (anchor) =>
              setAxisMenu({ axis, anchor }),
            ),
          }
        : { className: 'axis-title' }
      : onPickChannel
        ? {
            className: 'axis-title pickable',
            ...pickerTrigger(`${axis.toUpperCase()} axis: ${label(plot[axis]!)}. Change channel`, (anchor) =>
              setAxisMenu({ axis, anchor }),
            ),
          }
        : { className: 'axis-title' };

  const histPath = useMemo(() => {
    if (!hist || !is1d) return null;
    const shown = ovSamples.length ? ovHists : [];
    let max = 0;
    for (const hs of [hist.heights, ...shown.map((o) => o.heights)]) for (const v of hs) if (v > max) max = v;
    const top = max > 0 ? max * 1.05 : 1;
    const c = hist.centers;
    const half = c.length > 1 ? (c[1]! - c[0]!) / 2 : 0;
    const path = (hs: Float64Array) => {
      const pts: string[] = [`M${X(c[0]! - half)},${ph}`];
      for (let i = 0; i < c.length; i++) pts.push(`L${X(c[i]!)},${ph - ((hs[i] ?? 0) / top) * ph}`);
      pts.push(`L${X(c[c.length - 1]! + half)},${ph}Z`);
      return pts.join('');
    };
    return {
      d: path(hist.heights),
      top,
      overlays: shown
        .filter((o) => o.heights.length === c.length)
        .map((o) => ({ color: o.color, d: path(o.heights) })),
    };
  }, [hist, is1d, X, ph, ovHists, ovSamples.length]);

  const contourPaths = useMemo(
    () =>
      is1d
        ? null
        : raster?.contours.map((c) =>
            c.rings.map((r) => `M${r.map(([a, b]) => `${X(a)},${Y(b)}`).join('L')}Z`).join(''),
          ),
    [raster, is1d, X, Y],
  );

  const bgHistPath = useMemo(() => {
    if (!hist || !histPath || !bgHist || !is1d || bgHist.sub.length !== hist.centers.length) return null;
    let shown = 0;
    let counts = 0;
    for (const v of hist.heights) shown += v;
    for (const v of bgHist.base) counts += v;
    const k = counts > 0 ? shown / counts : 0;
    const c = hist.centers;
    const half = c.length > 1 ? (c[1]! - c[0]!) / 2 : 0;
    const pts: string[] = [`M${X(c[0]! - half)},${ph}`];
    for (let i = 0; i < c.length; i++)
      pts.push(`L${X(c[i]!)},${ph - ((bgHist.sub[i]! * k) / histPath.top) * ph}`);
    pts.push(`L${X(c[c.length - 1]! + half)},${ph}Z`);
    return pts.join('');
  }, [hist, histPath, bgHist, is1d, X, ph]);

  const fmtPct = (popId: string, region: Region, gateId: string) => {
    if (preview && preview.gateId === gateId) {
      const c = preview.regions[region] ?? 0;
      return preview.parent > 0 ? ((100 * c) / preview.parent).toFixed(2) : '–';
    }
    const c = counts[popId];
    if (!c || c.parent === 0) return '…';
    return ((100 * c.count) / c.parent).toFixed(2);
  };

  const gateEls = gates.map((gate) => {
    const geom = geomOf(gate);
    const m = maps(gate);
    const editable = interactive && m.every((d) => d.identity);
    const selected = interactive && selectedGateId === gate.id;
    const overridden = isOverridden(group, gate.id, sampleId);
    const pops = populationsOfGate(group.template, gate.id);
    const color = pops[0]?.color ?? '#2a78d6';
    const focused = focusPopId !== undefined && pops.some((p) => p.id === focusPopId);
    const dimmed = focusPopId !== undefined && !focused;
    const cls = `gate${selected ? ' selected' : ''}${overridden ? ' overridden' : ''}${focused ? ' focus' : ''}`;
    const handles: { id: string; x: number; y: number; shape?: 'mid' }[] = [];
    const labels: {
      popId: string;
      text: string;
      x: number;
      y: number;
      anchor: 'start' | 'end';
      focus?: boolean;
    }[] = [];
    let body: JSX.Element | null = null;

    if (geom.kind === 'split') {
      // FlowJo's bisector: one vertical divider and a bar across the plot; the two populations are
      // labelled in the top corners, − on the left and + on the right.
      const a = X(m[0]!.f(geom.at));
      const barY = ph * 0.12;
      body = (
        <g>
          <line x1={a} x2={a} y1={0} y2={ph} className={cls} style={{ stroke: color }} />
          <line x1={0} x2={pw} y1={barY} y2={barY} className={cls} style={{ stroke: color }} />
        </g>
      );
      handles.push({ id: 'c', x: a, y: barY });
      for (const p of pops)
        labels.push({
          popId: p.id,
          text: `${p.name} ${fmtPct(p.id, p.region, gate.id)}%`,
          x: p.region === 'hi' ? pw - 6 : 6,
          y: barY - 6,
          anchor: p.region === 'hi' ? 'end' : 'start',
          focus: p.id === focusPopId,
        });
    } else if (is1d && geom.kind === 'rect') {
      const a = X(m[0]!.f(geom.min[0] ?? -SPAN));
      const b = X(m[0]!.f(geom.max[0] ?? SPAN));
      const ca = Math.max(0, a);
      const cb = Math.min(pw, b);
      body = (
        <g>
          <rect
            x={ca}
            y={0}
            width={Math.max(0, cb - ca)}
            height={ph}
            className="gate-fill"
            style={{ fill: color }}
          />
          <line x1={a} x2={a} y1={0} y2={ph} className={cls} style={{ stroke: color }} />
          <line x1={b} x2={b} y1={0} y2={ph} className={cls} style={{ stroke: color }} />
          <line x1={ca} x2={cb} y1={ph * 0.12} y2={ph * 0.12} className={cls} style={{ stroke: color }} />
        </g>
      );
      if (geom.min[0] !== null) handles.push({ id: 'w', x: a, y: ph * 0.12 });
      if (geom.max[0] !== null) handles.push({ id: 'e', x: b, y: ph * 0.12 });
      const pop = pops[0];
      if (pop)
        labels.push({
          popId: pop.id,
          text: `${pop.name} ${fmtPct(pop.id, 'in', gate.id)}%`,
          x: Math.min(Math.max(ca + 4, 4), pw - 4),
          y: ph * 0.12 - 6,
          anchor: 'start',
        });
    } else if (geom.kind === 'quadrant' || geom.kind === 'spider') {
      const cx = X(m[0]!.f(geom.center[0]));
      const cy = Y(m[1]!.f(geom.center[1]));
      const rays: Pt[][] = [];
      const dirs: [number, number][] =
        geom.kind === 'quadrant'
          ? [
              [geom.center[0], geom.center[1] + 1],
              [geom.center[0] + 1, geom.center[1]],
              [geom.center[0], geom.center[1] - 1],
              [geom.center[0] - 1, geom.center[1]],
            ]
          : geom.arms.map((a) => [a[0], a[1]] as [number, number]);
      for (const d of dirs) {
        const pts: Pt[] = [];
        const end = rayEnd(
          geom.center,
          d,
          4 * Math.max(xr[1] - xr[0], yr[1] - yr[0], 1) * (m.every((q) => q.identity) ? 1 : 1e3),
        );
        const k = m.every((q) => q.identity) ? 1 : 200;
        for (let i = 0; i <= k; i++) {
          const t = i / k;
          const gx = geom.center[0] + (end[0] - geom.center[0]) * t;
          const gy = geom.center[1] + (end[1] - geom.center[1]) * t;
          pts.push({ x: X(m[0]!.f(gx)), y: Y(m[1]!.f(gy)) });
        }
        rays.push(pts);
      }
      body = (
        <g>
          {rays.map((r, i) => (
            <polyline
              key={i}
              points={r.map((p) => `${p.x},${p.y}`).join(' ')}
              className={cls}
              style={{ stroke: color }}
            />
          ))}
        </g>
      );
      handles.push({ id: geom.kind === 'spider' ? 'c' : 'c', x: cx, y: cy });
      if (geom.kind === 'spider')
        geom.arms.forEach((a, i) =>
          handles.push({ id: `arm${i}`, x: X(m[0]!.f(a[0])), y: Y(m[1]!.f(a[1])) }),
        );
      for (const p of pops) {
        const c = QUAD_CORNERS[p.region]?.(pw, ph);
        if (c)
          labels.push({
            popId: p.id,
            text: `${fmtPct(p.id, p.region, gate.id)}%`,
            x: c[0],
            y: c[1],
            anchor: c[2],
            focus: p.id === focusPopId,
          });
      }
    } else {
      const pts = shapePx(gate, geom);
      body = (
        <polygon
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          className={`${cls} gate-closed`}
          style={{ stroke: color }}
        />
      );
      if (geom.kind === 'rect') {
        const x0 = X(m[0]!.f(geom.min[0] ?? -SPAN));
        const x1 = X(m[0]!.f(geom.max[0] ?? SPAN));
        const y0 = Y(m[1]!.f(geom.min[1] ?? -SPAN));
        const y1 = Y(m[1]!.f(geom.max[1] ?? SPAN));
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        for (const [id, x, y] of [
          ['sw', x0, y0],
          ['se', x1, y0],
          ['nw', x0, y1],
          ['ne', x1, y1],
          ['w', x0, my],
          ['e', x1, my],
          ['s', mx, y0],
          ['n', mx, y1],
        ] as const)
          handles.push({ id, x, y });
      } else if (geom.kind === 'polygon') {
        geom.vertices.forEach((v, i) => {
          handles.push({ id: `v${i}`, x: X(m[0]!.f(v[0])), y: Y(m[1]!.f(v[1])) });
          const w = geom.vertices[(i + 1) % geom.vertices.length]!;
          handles.push({
            id: `mid${i}`,
            x: X(m[0]!.f((v[0] + w[0]) / 2)),
            y: Y(m[1]!.f((v[1] + w[1]) / 2)),
            shape: 'mid',
          });
        });
      } else if (geom.kind === 'ellipse') {
        const e = ellipseAxes(geom.mean, geom.cov, geom.d2);
        handles.push({ id: 'a', x: X(e.cx + e.a * Math.cos(e.theta)), y: Y(e.cy + e.a * Math.sin(e.theta)) });
        handles.push({ id: 'b', x: X(e.cx - e.b * Math.sin(e.theta)), y: Y(e.cy + e.b * Math.cos(e.theta)) });
      }
      const minX = Math.min(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y));
      const pop = pops[0];
      if (pop)
        labels.push({
          popId: pop.id,
          text: `${pop.name} ${fmtPct(pop.id, 'in', gate.id)}%`,
          x: Math.max(4, Math.min(pw - 60, minX)),
          y: Math.max(12, minY - 6),
          anchor: 'start',
        });
    }

    return (
      <g key={gate.id} data-gate-id={gate.id} className={dimmed ? 'gate-dim' : undefined}>
        <g className="gate-halo">{body}</g>
        {body}
        {labels.map((l) => {
          const off =
            drag?.kind === 'label' && drag.popId === l.popId
              ? drag.cur
              : group.template.populations[l.popId]?.labelOffset;
          // A moved label stays inside the plot, however small the plot is drawn.
          const x = off ? Math.min(Math.max(l.x + off[0] * pw, 2), pw - 2) : l.x;
          const y = off ? Math.min(Math.max(l.y + off[1] * ph, 10), ph - 2) : l.y;
          return (
            <text
              key={l.popId}
              x={x}
              y={y}
              textAnchor={l.anchor}
              data-label-pop={labelsMovable ? l.popId : undefined}
              className={`gate-label${l.focus ? ' focus' : ''}${labelsMovable ? ' movable' : ''}`}
              style={
                compact
                  ? undefined
                  : figureText(fig, fig.gateText, l.focus ? fig.gateFontSize * (13 / 11.5) : fig.gateFontSize)
              }
            >
              {labelsMovable && <title>Drag to move this label; double-click to put it back</title>}
              {l.text}
            </text>
          );
        })}
        {selected &&
          editable &&
          handles.map((h) =>
            h.shape === 'mid' ? (
              <circle
                key={h.id}
                cx={h.x}
                cy={h.y}
                r={3.5}
                className="handle handle-mid"
                data-handle={h.id}
                data-gate={gate.id}
              />
            ) : (
              <rect
                key={h.id}
                x={h.x - 4.5}
                y={h.y - 4.5}
                width={9}
                height={9}
                className="handle"
                data-handle={h.id}
                data-gate={gate.id}
              />
            ),
          )}
      </g>
    );
  });

  // draft shapes while creating
  let creating: JSX.Element | null = null;
  if (drag?.kind === 'create') {
    const [x0, y0] = drag.start;
    const [x1, y1] = drag.cur;
    if (drag.tool === 'range')
      creating = (
        <rect
          x={Math.min(X(x0), X(x1))}
          y={0}
          width={Math.abs(X(x1) - X(x0))}
          height={ph}
          className="draft"
        />
      );
    else if (drag.tool === 'rect')
      creating = (
        <rect
          x={Math.min(X(x0), X(x1))}
          y={Math.min(Y(y0), Y(y1))}
          width={Math.abs(X(x1) - X(x0))}
          height={Math.abs(Y(y1) - Y(y0))}
          className="draft"
        />
      );
    else
      creating = (
        <ellipse
          cx={(X(x0) + X(x1)) / 2}
          cy={(Y(y0) + Y(y1)) / 2}
          rx={Math.abs(X(x1) - X(x0)) / 2}
          ry={Math.abs(Y(y1) - Y(y0)) / 2}
          className="draft"
        />
      );
  }
  const polyDraft = poly ? (
    <g>
      <polyline
        points={[...poly, ...(hover ? [hover] : [])].map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}
        className="draft"
        fill="none"
      />
      {poly.map((p, i) => (
        <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={i === 0 ? 5 : 3} className="draft-vertex" />
      ))}
    </g>
  ) : null;

  // quadrant / spider: preview the gate and its region percentages under the cursor before it is placed
  let hoverDraft: JSX.Element | null = null;
  const hoverPct = (r: Region) =>
    hoverCounts && hoverCounts.parent > 0
      ? `${((100 * (hoverCounts.regions[r] ?? 0)) / hoverCounts.parent).toFixed(2)}%`
      : '…';
  if (hoverGeom?.kind === 'split') {
    const a = X(hoverGeom.at);
    const barY = ph * 0.12;
    hoverDraft = (
      <g className="hover-draft" pointerEvents="none">
        <line x1={a} y1={0} x2={a} y2={ph} className="draft" />
        <line x1={0} y1={barY} x2={pw} y2={barY} className="draft" />
        <text x={6} y={barY - 6} textAnchor="start" className="gate-label draft-label">
          {hoverPct('lo')}
        </text>
        <text x={pw - 6} y={barY - 6} textAnchor="end" className="gate-label draft-label">
          {hoverPct('hi')}
        </text>
      </g>
    );
  } else if (hoverGeom) {
    const cx = X(hoverGeom.center[0]);
    const cy = Y(hoverGeom.center[1]);
    const far = 4 * (pw + ph);
    const ends: [number, number][] =
      hoverGeom.kind === 'quadrant'
        ? [
            [cx, -far],
            [cx + far, cy],
            [cx, far],
            [cx - far, cy],
          ]
        : hoverGeom.arms.map((a) => {
            const dx = X(a[0]) - cx;
            const dy = Y(a[1]) - cy;
            const n = Math.hypot(dx, dy) || 1;
            return [cx + (dx / n) * far, cy + (dy / n) * far];
          });
    hoverDraft = (
      <g className="hover-draft" pointerEvents="none">
        {ends.map(([ex, ey], i) => (
          <line key={i} x1={cx} y1={cy} x2={ex} y2={ey} className="draft" />
        ))}
        <circle cx={cx} cy={cy} r={3} className="draft-vertex" />
        {(Object.keys(QUAD_CORNERS) as Region[]).map((r) => {
          const [x, y, anchor] = QUAD_CORNERS[r]!(pw, ph);
          return (
            <text key={r} x={x} y={y} textAnchor={anchor} className="gate-label draft-label">
              {hoverPct(r)}
            </text>
          );
        })}
      </g>
    );
  }

  const nonIdentityWarning =
    interactive && gates.some((g) => !maps(g).every((m) => m.identity))
      ? 'Some gates were drawn on a different axis scale; they are shown mapped onto this scale and can be edited after switching the axis back.'
      : null;

  return (
    <div className="plot" style={{ width, height }}>
      {!is1d && ovColor && (
        <canvas
          ref={ovCanvasRef}
          className="plot-raster"
          style={{ left: margin.l, top: margin.t, width: pw, height: ph }}
        />
      )}
      {!is1d && (
        <canvas
          ref={canvasRef}
          className={`plot-raster${bgPop ? ' faded' : ''}`}
          style={{ left: margin.l, top: margin.t, width: pw, height: ph }}
        />
      )}
      {!is1d && bgPop && (
        <canvas
          ref={bgCanvasRef}
          className="plot-raster"
          style={{ left: margin.l, top: margin.t, width: pw, height: ph }}
        />
      )}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className={`plot-overlay tool-${tool}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
        role="img"
        aria-label={`${plot.kind} plot of ${label(plot.x)}${plot.y && !is1d ? ` versus ${label(plot.y)}` : ''}`}
      >
        <g transform={`translate(${margin.l},${margin.t})`}>
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={pw} height={ph} />
            </clipPath>
          </defs>
          <rect
            x={0}
            y={0}
            width={pw}
            height={ph}
            className="plot-frame"
            style={
              compact
                ? undefined
                : { strokeWidth: fig.spineWidth, ...(fig.spineColor ? { stroke: fig.spineColor } : {}) }
            }
          />
          <g clipPath={`url(#${clipId})`}>
            {histPath?.overlays.map((o, i) => (
              <path key={i} d={o.d} className="hist-overlay" style={{ stroke: o.color }} />
            ))}
            {histPath && (
              <path
                d={histPath.d}
                className={`hist${bgPop ? ' faded' : ''}${ovColor ? ' hist-overlay' : ''}`}
                style={ovColor ? { stroke: ovColor } : undefined}
              />
            )}
            {bgHistPath && bgPop && (
              <path
                d={bgHistPath}
                className="hist-backgate"
                style={{ fill: bgPop.color, stroke: bgPop.color }}
              />
            )}
            {contourPaths?.map((d, i) => (
              <path key={i} className="contour" d={d} />
            ))}
            {gateEls}
            {creating}
            {polyDraft}
            {hoverDraft}
          </g>
          {!compact && (
            <>
              {title && (
                <text
                  className="plot-title"
                  x={pw / 2}
                  y={-10 - fig.titleFontSize * 0.4}
                  textAnchor="middle"
                  style={figureText(fig, fig.titleText, fig.titleFontSize)}
                >
                  {title}
                </text>
              )}
              <g className="axis" transform={`translate(0,${ph})`} style={{ fontFamily: tickCss.fontFamily }}>
                {xTicks.map((t, i) => (
                  <g key={i} transform={`translate(${X(t.pos)},0)`}>
                    <line y2={t.major ? 6 : 3} style={lineCss} />
                    {fig.showTickLabels && t.label && (
                      <text y={tickY} textAnchor="middle" style={tickCss}>
                        {t.label}
                      </text>
                    )}
                  </g>
                ))}
                <text {...axisTitle('x')} x={pw / 2} y={xTitleY} textAnchor="middle" style={axisTitleCss}>
                  {label(plot.x)}
                </text>
              </g>
              <g className="axis">
                {is1d
                  ? histYTicks(histPath?.top ?? 1, plot.style.histNorm).map((v) => (
                      <g key={v} transform={`translate(0,${ph - (v / (histPath?.top ?? 1)) * ph})`}>
                        <line x2={-6} style={lineCss} />
                        {fig.showTickLabels && (
                          <text x={-9} dy="0.32em" textAnchor="end" style={tickCss}>
                            {formatHistTick(v, plot.style.histNorm)}
                          </text>
                        )}
                      </g>
                    ))
                  : yTicks.map((t, i) => (
                      <g key={i} transform={`translate(0,${Y(t.pos)})`}>
                        <line x2={t.major ? -6 : -3} style={lineCss} />
                        {fig.showTickLabels && t.label && (
                          <text x={-9} dy="0.32em" textAnchor="end" style={tickCss}>
                            {t.label}
                          </text>
                        )}
                      </g>
                    ))}
                <text
                  {...axisTitle('y')}
                  transform={`translate(${yTitleX},${ph / 2}) rotate(-90)`}
                  textAnchor="middle"
                  style={axisTitleCss}
                >
                  {is1d ? histNormTitle : label(plot.y!)}
                </text>
              </g>
            </>
          )}
        </g>
      </svg>
      {(missing || error) && (
        <div className="plot-message" style={{ left: margin.l, top: margin.t, width: pw, height: ph }}>
          {missing ? 'Data not loaded — re-add this FCS file to view it.' : error}
        </div>
      )}
      {!compact &&
        !hideOffScaleNote &&
        fig.showOffScaleNote &&
        (() => {
          const st = is1d ? hist : raster;
          if (!st || (st.offScale === 0 && st.nan === 0)) return null;
          return (
            <div className="plot-note" style={{ marginLeft: margin.l }}>
              {st.nan > 0 && `${st.nan.toLocaleString()} non-positive on log axis, `}
              {st.offScale > 0 && `${st.offScale.toLocaleString()} off-scale`} (piled on edges)
            </div>
          );
        })()}
      {loading && !missing && (
        <div className="plot-loading" style={{ left: margin.l + pw - 90, top: margin.t + 4 }}>
          Computing…
        </div>
      )}
      {nonIdentityWarning && !compact && <div className="plot-warning">{nonIdentityWarning}</div>}
      {axisMenu && is1d && axisMenu.axis === 'y' && onPickHistNorm && (
        <PickerMenu
          anchor={axisMenu.anchor}
          title="Y axis shows"
          options={HIST_NORMS}
          value={plot.style.histNorm}
          onPick={(v) => onPickHistNorm(v as HistNorm)}
          onClose={closeAxisMenu}
        />
      )}
      {axisMenu && !(is1d && axisMenu.axis === 'y') && onPickChannel && (
        <PickerMenu
          anchor={axisMenu.anchor}
          title={`${axisMenu.axis.toUpperCase()} axis channel`}
          options={channelOptions(group, ws.samples[sampleId])}
          value={plot[axisMenu.axis]?.channel}
          onPick={(ch) => onPickChannel(axisMenu.axis, ch)}
          onClose={closeAxisMenu}
        />
      )}
    </div>
  );
});

/** User ticks in data units, placed on the scale and kept within the axis range. */
function customTicks(
  ticks: { value: number; label?: string }[],
  apply: (v: number) => number,
  [lo, hi]: readonly number[],
) {
  return ticks
    .map((t) => ({ pos: apply(t.value), label: t.label ?? formatLinear(t.value), major: true }))
    .filter((t) => Number.isFinite(t.pos) && t.pos >= lo! - 1e-9 && t.pos <= hi! + 1e-9);
}

function histYTicks(top: number, norm: string): number[] {
  if (norm === 'mode') return [0, 0.25, 0.5, 0.75, 1].filter((v) => v <= top);
  const raw = top / 5;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-12; v += step) out.push(v);
  return out;
}

function formatHistTick(v: number, norm: string): string {
  if (norm === 'mode') return `${Math.round(v * 100)}`;
  if (norm === 'area') return v.toPrecision(2);
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}

/** A plot drawn as dots of at least 2 px, for overlays where every sample needs its own flat colour. */
function overlayDots(plot: PlotSpec): PlotSpec {
  return {
    ...plot,
    kind: 'dot',
    style: { ...plot.style, pointPx: Math.max(2, plot.style.pointPx) },
  };
}
