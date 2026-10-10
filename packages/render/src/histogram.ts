import { type BinStats, bin1d, smooth1d } from '@flowmeris/density';
import type { PlotStyle } from '@flowmeris/model';

// ---------------------------------------------------------------------------
// Histograms (vector)
// ---------------------------------------------------------------------------

export interface HistogramOutput {
  /** Bin centres (display units) and normalised heights. */
  centers: Float64Array;
  heights: Float64Array;
  /** Normalisation applied: 'count' (events/bin), 'mode' (max = 1), 'area' (sum = 1). */
  norm: PlotStyle['histNorm'];
  stats: BinStats;
}

export function histogram(
  x: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  range: [number, number],
  style: Pick<PlotStyle, 'histBins' | 'histNorm' | 'histSmooth'> & { histSigmaBins?: number },
): HistogramOutput {
  const h = bin1d(x, indices, range, style.histBins);
  let counts = h.counts;
  if (style.histSmooth) counts = smooth1d(counts, style.histSigmaBins ?? 1.5);
  const heights = Float64Array.from(counts);
  if (style.histNorm === 'mode') {
    let m = 0;
    for (const v of heights) if (v > m) m = v;
    if (m > 0) for (let i = 0; i < heights.length; i++) heights[i] = (heights[i] as number) / m;
  } else if (style.histNorm === 'area') {
    let s = 0;
    for (const v of heights) s += v;
    if (s > 0) for (let i = 0; i < heights.length; i++) heights[i] = (heights[i] as number) / s;
  }
  const centers = new Float64Array(style.histBins);
  const bw = (range[1] - range[0]) / style.histBins;
  for (let i = 0; i < style.histBins; i++) centers[i] = range[0] + (i + 0.5) * bw;
  return { centers, heights, norm: style.histNorm, stats: h.stats };
}
