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
  const ws = useStore((s) => s.ws);
  const popId = useStore((s) => s.ui.popId);
  const noData = useStore((s) => s.status.missing);
  const [data, setData] = useState<Record<string, HistogramResponse>>({});

  const key = useMemo(
    () =>
      group && axis
        ? JSON.stringify([
            [...sampleIds].sort().map((s) => lineageKey(ws, group, s, popId)),
            axis,
            ws.transforms[axis.transform],
            [style.bins, style.smoothing],
          ])
        : '',
    [group, sampleIds, axis, ws, popId],
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
      if (noData[sid]) continue;
      getPool()
        .histogram(ctx, sid, popId, axis, hist as unknown as PlotSpec['style'])
        .then((h) => live && setData((d) => ({ ...d, [sid]: h })))
        .catch(() => {});
    }
    return () => {
      live = false;
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
