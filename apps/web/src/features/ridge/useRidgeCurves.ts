import { type RidgeCurve, combineCounts } from '@flowmeris/density';
import type { HistogramResponse } from '@flowmeris/engine';
import type { PlotSpec } from '@flowmeris/model';
import { useEffect, useMemo, useState } from 'react';
import { getPool } from '../../engine-client/pool.ts';
import { lineageKey } from '../../lib/keys.ts';
import { contextFor, useStore } from '../../state/store.ts';
import type { Ridge } from './useRidge.ts';

/**
 * Each ridge's curve: its samples' histograms on the ridge axis, in counts, combined (M-PLOT-RIDGE-COMBINE)
 * and scaled to the mode. A ridge is null until all its replicates (other than missing files) have loaded.
 */
export function useRidgeCurves({ group, style, combine, axis, rows }: Ridge, sampleIds: string[]) {
  const transforms = useStore((s) => s.ws.transforms);
  const compMatrices = useStore((s) => s.ws.compMatrices);
  const popId = useStore((s) => s.ui.popId);
  const noData = useStore((s) => s.status.missing);
  const [data, setData] = useState<Record<string, HistogramResponse>>({});

  // Each sample's histogram's cache key: everything it depends on.
  const keys = useMemo(() => {
    const out = new Map<string, string>();
    if (!group || !axis) return out;
    // lineageKey reads only the workspace's transforms and compensation matrices (the dependencies).
    const ws = useStore.getState().ws;
    const hist = [style.bins, style.smoothing];
    for (const s of [...sampleIds].sort())
      out.set(
        s,
        JSON.stringify(['ridge', lineageKey(ws, group, s, popId), axis, transforms[axis.transform], hist]),
      );
    return out;
  }, [group, sampleIds, axis, transforms, compMatrices, popId, style.bins, style.smoothing]);
  const key = useMemo(() => JSON.stringify([...keys.values()]), [keys]);
  useEffect(() => {
    if (!group || !axis) return;
    const ac = new AbortController();
    const ctx = contextFor({ transforms, compMatrices }, group);
    // Counts, so replicates can be combined; each ridge is scaled to its mode below.
    const hist = {
      histBins: style.bins,
      histNorm: 'count' as const,
      histSmooth: style.smoothing > 0,
      histSigmaBins: style.smoothing,
    };
    // Cached histograms are shown at once; the others as they arrive, at most one update per frame.
    const shown: Record<string, HistogramResponse> = {};
    let arrived: Record<string, HistogramResponse> = {};
    let frame = 0;
    const flush = () => {
      frame = 0;
      const add = arrived;
      arrived = {};
      setData((d) => ({ ...d, ...add }));
    };
    for (const sid of sampleIds) {
      if (noData[sid]) continue;
      const k = keys.get(sid)!;
      const hit = getPool().cached<HistogramResponse>(k);
      if (hit) {
        shown[sid] = hit;
        continue;
      }
      getPool()
        .histogram(ctx, sid, popId, axis, hist as unknown as PlotSpec['style'], { key: k, signal: ac.signal })
        .then((h) => {
          if (ac.signal.aborted) return;
          arrived[sid] = h;
          frame ||= requestAnimationFrame(flush);
        })
        .catch(() => {});
    }
    setData(shown);
    return () => {
      ac.abort();
      cancelAnimationFrame(frame);
    };
  }, [key]);

  return useMemo(() => {
    const out: Record<string, RidgeCurve | null> = {};
    for (const r of rows) {
      const ids = r.sampleIds.filter((id) => !noData[id]);
      const hs = ids.flatMap((id) => data[id] ?? []);
      out[r.id] =
        hs.length && hs.length === ids.length ? combineCounts(hs, combine.method, combine.band) : null;
    }
    return out;
  }, [rows, data, noData, combine.method, combine.band]);
}
