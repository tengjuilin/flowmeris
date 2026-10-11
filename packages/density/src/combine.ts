/** Combining replicate histograms for ridge plots (M-PLOT-RIDGE-COMBINE; docs/methods/plots.md). */

/** Event counts per bin (smoothed) of one sample on the shared axis. */
export interface BinCounts {
  centers: Float64Array;
  heights: Float64Array;
  eventsPlotted: number;
}

/** A ridge curve scaled to a mode of 1, with an optional spread band on the same scale. */
export interface RidgeCurve {
  centers: Float64Array;
  heights: Float64Array;
  band?: { lo: Float64Array; hi: Float64Array };
  /** Events over all replicates. */
  events: number;
  /** Replicates that contributed (those with events, for 'mean'). */
  n: number;
}

/**
 * Combine replicate histograms sharing the same bins (M-PLOT-RIDGE-COMBINE). 'pool' adds the counts;
 * 'mean' averages each replicate's unit-area histogram, so every replicate weighs the same, with an
 * optional ±SD or ±SEM (n − 1 denominator) band per bin. The result is scaled to a mode of 1. A single
 * histogram gives the usual mode-normalized curve.
 */
export function combineCounts(
  hs: BinCounts[],
  method: 'mean' | 'pool',
  band: 'none' | 'sd' | 'sem',
): RidgeCurve | null {
  const first = hs[0];
  if (!first) return null;
  const nb = first.heights.length;
  const events = hs.reduce((a, h) => a + h.eventsPlotted, 0);
  const mean = new Float64Array(nb);
  let n = hs.length;
  let sd: Float64Array | null = null;
  if (method === 'pool' || hs.length === 1) {
    for (const h of hs) for (let k = 0; k < nb; k++) mean[k] = mean[k]! + h.heights[k]!;
  } else {
    const curves = hs.flatMap((h) => {
      let total = 0;
      for (let k = 0; k < nb; k++) total += h.heights[k]!;
      return total > 0 ? [h.heights.map((v) => v / total)] : [];
    });
    n = curves.length;
    for (const c of curves) for (let k = 0; k < nb; k++) mean[k] = mean[k]! + c[k]! / n;
    if (band !== 'none' && n > 1) {
      sd = new Float64Array(nb);
      for (const c of curves) for (let k = 0; k < nb; k++) sd[k] = sd[k]! + (c[k]! - mean[k]!) ** 2;
      const div = band === 'sem' ? (n - 1) * n : n - 1;
      for (let k = 0; k < nb; k++) sd[k] = Math.sqrt(sd[k]! / div);
    }
  }
  let max = 0;
  for (let k = 0; k < nb; k++) max = Math.max(max, mean[k]!);
  const s = max > 0 ? 1 / max : 0;
  const heights = mean.map((v) => v * s);
  return {
    centers: first.centers,
    heights,
    ...(sd && {
      band: {
        lo: heights.map((v, k) => Math.max(0, v - sd[k]! * s)),
        hi: heights.map((v, k) => v + sd[k]! * s),
      },
    }),
    events,
    n,
  };
}
