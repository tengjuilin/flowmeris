/** SVG paths of histograms and contours, in plot pixels (`X`, `Y` from a PlotFrame; `ph` the plot height). */

/** A histogram y-axis top: 5% above the highest bin of any series, or 1 when every bin is empty. */
export function histTop(series: ArrayLike<number>[]): number {
  let max = 0;
  for (const hs of series) for (let i = 0; i < hs.length; i++) if (hs[i]! > max) max = hs[i]!;
  return max > 0 ? max * 1.05 : 1;
}

/**
 * The area under a histogram series: bin centers joined from the left edge of the first bin to the
 * right edge of the last, closed along the x axis. Heights are scaled so `top` is the plot's top.
 */
export function histAreaPath(
  centers: ArrayLike<number>,
  heights: ArrayLike<number>,
  top: number,
  X: (v: number) => number,
  ph: number,
): string {
  const n = centers.length;
  const half = n > 1 ? (centers[1]! - centers[0]!) / 2 : 0;
  const pts: string[] = [`M${X(centers[0]! - half)},${ph}`];
  for (let i = 0; i < n; i++) pts.push(`L${X(centers[i]!)},${ph - ((heights[i] ?? 0) / top) * ph}`);
  pts.push(`L${X(centers[n - 1]! + half)},${ph}Z`);
  return pts.join('');
}

/**
 * Backgated population's counts per bin (`sub`) put on the shown histogram's normalization: smoothing
 * and every normalization are linear, so the factor shown total / plot-population count total (`base`)
 * maps counts to heights.
 */
export function backgateHeights(
  shown: ArrayLike<number>,
  base: ArrayLike<number>,
  sub: ArrayLike<number>,
): number[] {
  let s = 0;
  let b = 0;
  for (let i = 0; i < shown.length; i++) s += shown[i]!;
  for (let i = 0; i < base.length; i++) b += base[i]!;
  const k = b > 0 ? s / b : 0;
  return Array.from(sub, (v) => v * k);
}

/** Closed contour rings, in display units, as one SVG path. */
export function contourPath(
  rings: [number, number][][],
  X: (v: number) => number,
  Y: (v: number) => number,
): string {
  return rings.map((r) => `M${r.map(([a, b]) => `${X(a)},${Y(b)}`).join('L')}Z`).join('');
}
