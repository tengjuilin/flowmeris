import { contours as d3contours } from 'd3-contour';

/**
 * Binning, smoothing and contour levels for plots (methods M-PLOT-*;
 * docs/methods/plots.md). All operations happen in display (transformed)
 * units.
 */

export interface Grid2D {
  nx: number;
  ny: number;
  /** Row-major, row 0 = lowest y bin. */
  values: Float64Array;
  /** Display-unit extent [xmin, xmax] × [ymin, ymax]. */
  x: [number, number];
  y: [number, number];
}

export interface BinStats {
  /** Events binned (including those piled on the axis edges). */
  binned: number;
  /** Events with a coordinate below/above the axis range (piled on the edge bin). */
  offScale: number;
  /** Events with NaN coordinates (e.g. log of ≤ 0), piled on the axis minimum. */
  nan: number;
}

/**
 * 2D histogram. Events beyond the display range, and NaN coordinates, are
 * placed in the edge bin of that axis ("piled on the axis", as cytometry
 * software conventionally does) and counted separately in BinStats.
 */
export function bin2d(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  xr: [number, number],
  yr: [number, number],
  nx: number,
  ny: number,
): { grid: Grid2D; stats: BinStats } {
  const values = new Float64Array(nx * ny);
  const sx = nx / (xr[1] - xr[0]);
  const sy = ny / (yr[1] - yr[0]);
  let offScale = 0;
  let nan = 0;
  const m = indices ? indices.length : xs.length;
  for (let k = 0; k < m; k++) {
    const i = indices ? (indices[k] as number) : k;
    const x = xs[i] as number;
    const y = ys[i] as number;
    let bx: number;
    let by: number;
    let off = false;
    if (Number.isNaN(x)) {
      bx = 0;
      nan++;
    } else {
      bx = Math.floor((x - xr[0]) * sx);
      if (bx < 0) {
        bx = 0;
        off = true;
      } else if (bx >= nx) {
        bx = nx - 1;
        off = true;
      }
    }
    if (Number.isNaN(y)) {
      by = 0;
      if (!Number.isNaN(x)) nan++;
    } else {
      by = Math.floor((y - yr[0]) * sy);
      if (by < 0) {
        by = 0;
        off = true;
      } else if (by >= ny) {
        by = ny - 1;
        off = true;
      }
    }
    if (off) offScale++;
    values[by * nx + bx] = (values[by * nx + bx] as number) + 1;
  }
  return { grid: { nx, ny, values, x: xr, y: yr }, stats: { binned: m, offScale, nan } };
}

export interface Hist1D {
  counts: Float64Array;
  range: [number, number];
  stats: BinStats;
}

/** 1D histogram with the same edge/NaN conventions as bin2d. */
export function bin1d(
  xs: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  range: [number, number],
  bins: number,
): Hist1D {
  const counts = new Float64Array(bins);
  const s = bins / (range[1] - range[0]);
  let offScale = 0;
  let nan = 0;
  const m = indices ? indices.length : xs.length;
  for (let k = 0; k < m; k++) {
    const x = xs[indices ? (indices[k] as number) : k] as number;
    let b: number;
    if (Number.isNaN(x)) {
      b = 0;
      nan++;
    } else {
      b = Math.floor((x - range[0]) * s);
      if (b < 0) {
        b = 0;
        offScale++;
      } else if (b >= bins) {
        b = bins - 1;
        offScale++;
      }
    }
    counts[b] = (counts[b] as number) + 1;
  }
  return { counts, range, stats: { binned: m, offScale, nan } };
}

/** Normalised Gaussian kernel truncated at ±4σ. */
export function gaussianKernel(sigma: number): Float64Array {
  const r = Math.max(1, Math.ceil(4 * sigma));
  const k = new Float64Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    s += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] as number) / s;
  return k;
}

/** 1D convolution with zero padding (mass beyond the edges is lost; documented). */
export function smooth1d(v: Float64Array, sigma: number): Float64Array {
  if (!(sigma > 0)) return Float64Array.from(v);
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const n = v.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -r; j <= r; j++) {
      const t = i + j;
      if (t >= 0 && t < n) s += (v[t] as number) * (k[j + r] as number);
    }
    out[i] = s;
  }
  return out;
}

/**
 * Separable Gaussian smoothing of a binned 2D histogram — a binned kernel
 * density estimate (Wand 1994) with bandwidth σ bins on both axes.
 */
export function smooth2d(g: Grid2D, sigma: number): Grid2D {
  if (!(sigma > 0)) return { ...g, values: Float64Array.from(g.values) };
  const { nx, ny } = g;
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const src = g.values;
  // Each pass scatters the non-zero inputs (cytometry grids are mostly empty) in ascending source
  // order, so every output receives the same terms in the same order as a direct convolution sum:
  // the result is bit-identical to it.
  const tmp = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    const row = y * nx;
    for (let t = 0; t < nx; t++) {
      const v = src[row + t] as number;
      if (v === 0) continue;
      const lo = Math.max(0, t - r);
      const hi = Math.min(nx - 1, t + r);
      for (let x = lo; x <= hi; x++) tmp[row + x] = (tmp[row + x] as number) + v * (k[t - x + r] as number);
    }
  }
  const out = new Float64Array(nx * ny);
  for (let t = 0; t < ny; t++) {
    const srow = t * nx;
    let x0 = 0;
    while (x0 < nx && tmp[srow + x0] === 0) x0++;
    if (x0 === nx) continue;
    let x1 = nx - 1;
    while (tmp[srow + x1] === 0) x1--;
    const lo = Math.max(0, t - r);
    const hi = Math.min(ny - 1, t + r);
    for (let y = lo; y <= hi; y++) {
      const w = k[t - y + r] as number;
      const orow = y * nx;
      for (let x = x0; x <= x1; x++) {
        const v = tmp[srow + x] as number;
        if (v !== 0) out[orow + x] = (out[orow + x] as number) + v * w;
      }
    }
  }
  return { ...g, values: out };
}

/**
 * Scott's rule bandwidth for a 2D KDE, per axis: σ = sd · n^(−1/6) (display
 * units). Returned in bins for a grid of `bins` over `range`.
 */
export function scottSigmaBins(values: ArrayLike<number>, range: [number, number], bins: number): number {
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (Number.isNaN(v)) continue;
    n++;
    const d = v - mean;
    mean += d / n;
    m2 += d * (v - mean);
  }
  if (n < 2) return 0;
  const sd = Math.sqrt(m2 / (n - 1));
  return (sd * n ** (-1 / 6) * bins) / (range[1] - range[0]);
}

/**
 * Equal-probability contour levels (M-PLOT-CONTOUR-EQP). Cells are sorted by
 * density; level k is the density at which the cumulative mass of the densest
 * cells first reaches k·p, for k = 1 … ⌊1/p⌋ − 1. Each band between
 * consecutive lines then holds (approximately) the fraction p of events, and
 * the outermost line encloses 1 − p of the events.
 */
export function equalProbabilityLevels(values: Float64Array, p: number): number[] {
  const pairs = Float64Array.from(values).filter((v) => v > 0);
  pairs.sort();
  let total = 0;
  for (const v of pairs) total += v;
  if (total === 0) return [];
  const k = Math.round(1 / p);
  const targets: number[] = [];
  for (let i = 1; i < k; i++) targets.push(i * p * total);
  return levelsAtEnclosedMass(pairs, targets);
}

/**
 * Logarithmic contour levels (M-PLOT-CONTOUR-LOG): the outermost line encloses
 * 98% of events and each line inward encloses half as many as the previous.
 */
export function logContourLevels(values: Float64Array, levels: number): number[] {
  const pairs = Float64Array.from(values).filter((v) => v > 0);
  pairs.sort();
  let total = 0;
  for (const v of pairs) total += v;
  if (total === 0) return [];
  const targets: number[] = [];
  for (let i = 0; i < levels; i++) targets.push(0.98 * 0.5 ** i * total);
  return levelsAtEnclosedMass(pairs, targets.reverse());
}

/** Given ascending cell densities, the density thresholds whose super-level sets enclose each target mass. */
function levelsAtEnclosedMass(ascending: Float64Array, targets: number[]): number[] {
  const out: number[] = [];
  const sorted = [...targets].sort((a, b) => a - b);
  let cum = 0;
  let t = 0;
  for (let i = ascending.length - 1; i >= 0 && t < sorted.length; i--) {
    cum += ascending[i] as number;
    while (t < sorted.length && cum >= (sorted[t] as number)) {
      out.push(ascending[i] as number);
      t++;
    }
  }
  // Ascending thresholds, de-duplicated (flat regions can map several targets to one density).
  return [...new Set(out)].sort((a, b) => a - b);
}

export interface ContourLine {
  level: number;
  /** Rings in display units: [[x, y], …]. */
  rings: [number, number][][];
}

/** Marching-squares iso-lines (d3-contour) mapped back to display units. */
export function contourLines(g: Grid2D, levels: number[]): ContourLine[] {
  const gen = d3contours().size([g.nx, g.ny]).thresholds(levels).smooth(true);
  const sx = (g.x[1] - g.x[0]) / g.nx;
  const sy = (g.y[1] - g.y[0]) / g.ny;
  return gen(Array.from(g.values)).map((mp) => ({
    level: mp.value,
    rings: mp.coordinates.flatMap((poly) =>
      poly.map((ring) =>
        ring.map(([x, y]) => [g.x[0] + (x as number) * sx, g.y[0] + (y as number) * sy] as [number, number]),
      ),
    ),
  }));
}
