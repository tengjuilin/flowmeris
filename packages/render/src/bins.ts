import type { BinStats } from '@flowmeris/density';

/** What `binTwice` reads: the events' coordinates, which of them to plot and the axis ranges. */
export interface BinInput {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** Event indices to plot (null = all). */
  indices: ArrayLike<number> | null;
  xRange: [number, number];
  yRange: [number, number];
}

/** The bin of `v` (not NaN) on an axis of `n` bins from `lo` at `s` bins per unit, unclamped. */
const rawBin = (v: number, lo: number, s: number) => Math.floor((v - lo) * s);
const clampBin = (b: number, n: number) => (b < 0 ? 0 : b >= n ? n - 1 : b);

/**
 * M-PLOT-BIN on two grids in one pass over the events: `w` × `h` image pixels and the `n` × `n` density
 * grid. Each grid holds exactly what `bin2d` from `@flowmeris/density` gives at its size (the same
 * arithmetic per event); `stats` are those of the density grid.
 */
export function binTwice(
  inp: BinInput,
  w: number,
  h: number,
  n: number,
): { pixels: Float64Array; density: Float64Array; stats: BinStats } {
  const { x: xs, y: ys, indices, xRange: xr, yRange: yr } = inp;
  const pixels = new Float64Array(w * h);
  const density = new Float64Array(n * n);
  const pxs = w / (xr[1] - xr[0]);
  const pys = h / (yr[1] - yr[0]);
  const dxs = n / (xr[1] - xr[0]);
  const dys = n / (yr[1] - yr[0]);
  let offScale = 0;
  let nan = 0;
  const m = indices ? indices.length : xs.length;
  for (let k = 0; k < m; k++) {
    const i = indices ? (indices[k] as number) : k;
    const x = xs[i] as number;
    const y = ys[i] as number;
    let pbx = 0;
    let pby = 0;
    let dbx = 0;
    let dby = 0;
    let off = false;
    if (Number.isNaN(x)) nan++;
    else {
      pbx = clampBin(rawBin(x, xr[0], pxs), w);
      const b = rawBin(x, xr[0], dxs);
      if (b < 0 || b >= n) off = true;
      dbx = clampBin(b, n);
    }
    if (Number.isNaN(y)) {
      if (!Number.isNaN(x)) nan++;
    } else {
      pby = clampBin(rawBin(y, yr[0], pys), h);
      const b = rawBin(y, yr[0], dys);
      if (b < 0 || b >= n) off = true;
      dby = clampBin(b, n);
    }
    if (off) offScale++;
    pixels[pby * w + pbx] = (pixels[pby * w + pbx] as number) + 1;
    density[dby * n + dbx] = (density[dby * n + dbx] as number) + 1;
  }
  return { pixels, density, stats: { binned: m, offScale, nan } };
}
