import type { AnalysisContext, HistogramResponse, RasterResponse } from '@flowmeris/engine';
import { type Group, type PlotSpec, type Workspace, populationsOfGate } from '@flowmeris/model';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getPool } from '../../engine-client/pool.ts';
import { gateMatchesAxes } from '../../lib/geometry.ts';
import { lineageKey } from '../../lib/keys.ts';

/** What every data hook of one plot needs: where it is drawn and at what resolution. */
export interface PlotDataArgs {
  ws: Workspace;
  group: Group;
  ctx: AnalysisContext;
  sampleId: string;
  plot: PlotSpec;
  /** `plotKey` of the plot: identifies its events completely. */
  plotKey: string;
  is1d: boolean;
  /** Plot area in CSS pixels, and device pixels per CSS pixel. */
  pw: number;
  ph: number;
  dpr: number;
  /** The sample's data is not loaded. */
  missing: boolean;
}

/** Draws a raster result into a canvas (results may be shared cached objects: ImageData only reads them). */
function paint(c: HTMLCanvasElement | null, r: RasterResponse | null) {
  if (!c || !r) return;
  c.width = r.width;
  c.height = r.height;
  const g = c.getContext('2d');
  if (!g) return;
  g.putImageData(new ImageData(r.rgba, r.width, r.height), 0, 0);
}

/**
 * The plot's own events: a histogram, or a raster drawn into the returned canvas. With `ovColor` (other
 * samples overlaid) the raster is flat dots of that colour.
 */
export function usePlotEvents(a: PlotDataArgs, ovColor: string | undefined) {
  const { ctx, sampleId, plot, plotKey: key, is1d, pw, ph, dpr, missing } = a;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [raster, setRaster] = useState<RasterResponse | null>(null);
  const [hist, setHist] = useState<HistogramResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

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
    const hit = getPool().cached<HistogramResponse & RasterResponse>(dataKey);
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
          const h = await getPool().histogram(ctx, sampleId, plot.population, plot.x, plot.style, opts);
          if (id === reqId.current) setHist(h);
        } else {
          const r = await getPool().raster(
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
    if (!is1d) paint(canvasRef.current, raster);
  }, [raster, is1d]);

  return { canvasRef, raster, hist, error, loading };
}

/**
 * Backgating: a descendant population's events over the plot, in its colour. 2D: a raster drawn into the
 * returned canvas. Histogram: the population's and the plot population's counts per bin, so the overlay
 * can be scaled to the plot's normalisation.
 */
export function useBackgate(a: PlotDataArgs, bgPop: { popId: string; color: string } | null) {
  const { ws, group, ctx, sampleId, plot, plotKey: key, is1d, pw, ph, dpr, missing } = a;
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const [bgRaster, setBgRaster] = useState<RasterResponse | null>(null);
  const [bgHist, setBgHist] = useState<{ sub: Float64Array; base: Float64Array } | null>(null);
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
          getPool().histogram(ctx, sampleId, plot.population, plot.x, style, { key: `${bgKey}|base` }),
          getPool().histogram(ctx, sampleId, bgPop.popId, plot.x, style, { key: `${bgKey}|sub` }),
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
        const r = await getPool().raster(ctx, req, { key: `${bgKey}|raster|${req.width}|${req.height}` });
        if (live) setBgRaster(r);
      }
    };
    run().catch(() => {});
    return () => {
      live = false;
    };
  }, [bgKey, pw, ph, dpr, missing]);

  useEffect(() => {
    if (!is1d) paint(bgCanvasRef.current, bgRaster);
  }, [bgRaster, is1d]);

  return { bgCanvasRef, bgHist };
}

/**
 * Other samples overlaid on the plot, each in its colour: their histograms, or their rasters composited
 * into the returned canvas.
 */
export function useOverlaySamples(a: PlotDataArgs, ovSamples: { sampleId: string; color: string }[]) {
  const { ws, group, ctx, plot, is1d, pw, ph, dpr } = a;
  const ovCanvasRef = useRef<HTMLCanvasElement>(null);
  const [ovHists, setOvHists] = useState<{ color: string; heights: Float64Array }[]>([]);
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
          ovSamples.map((o) => getPool().histogram(ctx, o.sampleId, plot.population, plot.x, plot.style)),
        );
        if (live) setOvHists(hs.map((h, i) => ({ color: ovSamples[i]!.color, heights: h.heights })));
        return;
      }
      const w = Math.round(pw * dpr);
      const h = Math.round(ph * dpr);
      const rs = await Promise.all(
        ovSamples.map((o) =>
          getPool().raster(ctx, {
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

  return { ovCanvasRef, ovHists };
}

/** The gates drawn on the plot (children of its population on its axes) and their populations' counts. */
export function useGateCounts(a: PlotDataArgs) {
  const { ws, group, ctx, sampleId, plot, is1d, missing } = a;
  const [counts, setCounts] = useState<Record<string, { count: number; parent: number }>>({});
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
    getPool()
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

  return { gates, counts };
}

/** A plot drawn as dots of at least 2 px, for overlays where every sample needs its own flat colour. */
function overlayDots(plot: PlotSpec): PlotSpec {
  return {
    ...plot,
    kind: 'dot',
    style: { ...plot.style, pointPx: Math.max(2, plot.style.pointPx) },
  };
}
