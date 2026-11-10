import type { ColorStat } from '@flowmeris/model';

// ---------------------------------------------------------------------------
// Pseudocolor channel plots: each pixel colored by a third channel
// ---------------------------------------------------------------------------

/** What the color of each pixel of a Pseudocolor channel plot is computed from. */
export interface ChannelColorInput {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** The color channel's values, in its transformed units. */
  c: ArrayLike<number>;
  /** Event indices to plot (null = all). */
  indices: ArrayLike<number> | null;
  xRange: [number, number];
  yRange: [number, number];
  /** The color axis's range: its minimum is color 0, its maximum color 1. */
  cRange: [number, number];
  stat: ColorStat;
  width: number;
  height: number;
}

/** The median of `v` (sorted in place): the middle value, or the mean of the two middle values. */
function median(v: Float64Array): number {
  v.sort();
  const m = v.length >> 1;
  return v.length % 2 ? (v[m] as number) : ((v[m - 1] as number) + (v[m] as number)) / 2;
}

function statOf(v: Float64Array, stat: ColorStat): number {
  if (stat === 'median') return median(v);
  let s = stat === 'max' ? Number.NEGATIVE_INFINITY : 0;
  for (let i = 0; i < v.length; i++) s = stat === 'max' ? Math.max(s, v[i] as number) : s + (v[i] as number);
  return stat === 'max' ? s : s / v.length;
}

/**
 * M-PLOT-PSEUDO-CHANNEL: for every image pixel (row 0 = lowest y, as `bin2d`), the median, mean or maximum
 * of the color channel's values of the events in it, as a position 0–1 on the color axis's range; NaN where
 * the pixel holds no event. Events are placed in pixels as `bin2d` places them (off-scale ones piled on the
 * edges). Each value is first clamped to the color range, a NaN (log of a non-positive value) taken as its
 * minimum, so the events beyond the range are piled on its ends as on the x and y axes.
 */
export function channelColorAtPixels(inp: ChannelColorInput): Float64Array {
  const { width: w, height: h, xRange: xr, yRange: yr, cRange: cr, indices } = inp;
  const sx = w / (xr[1] - xr[0]);
  const sy = h / (yr[1] - yr[0]);
  const span = cr[1] - cr[0];
  const m = indices ? indices.length : inp.x.length;
  const bin = (v: number, lo: number, s: number, n: number) =>
    Number.isNaN(v) ? 0 : Math.max(0, Math.min(n - 1, Math.floor((v - lo) * s)));
  // Counting sort of the events by pixel: `start` holds where each pixel's values begin.
  const pixelOf = new Int32Array(m);
  const start = new Int32Array(w * h + 1);
  for (let k = 0; k < m; k++) {
    const i = indices ? (indices[k] as number) : k;
    const p = bin(inp.y[i] as number, yr[0], sy, h) * w + bin(inp.x[i] as number, xr[0], sx, w);
    pixelOf[k] = p;
    start[p + 1] = (start[p + 1] as number) + 1;
  }
  for (let p = 0; p < w * h; p++) start[p + 1] = (start[p + 1] as number) + (start[p] as number);
  const fill = start.slice(0, w * h);
  const values = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    const i = indices ? (indices[k] as number) : k;
    const c = inp.c[i] as number;
    const t = Number.isNaN(c) || !(span > 0) ? 0 : (c - cr[0]) / span;
    const p = pixelOf[k] as number;
    values[fill[p] as number] = Math.max(0, Math.min(1, t));
    fill[p] = (fill[p] as number) + 1;
  }
  const out = new Float64Array(w * h).fill(Number.NaN);
  for (let p = 0; p < w * h; p++) {
    const a = start[p] as number;
    const b = start[p + 1] as number;
    if (b > a) out[p] = statOf(values.subarray(a, b), inp.stat);
  }
  return out;
}

/** The colormap entry (of 256) a position `t` on the color scale takes, clamped to the ends. */
export const colorBucket = (t: number): number => Math.max(0, Math.min(255, Math.round(t * 255)));

/**
 * The occupied pixels of `t` (NaN = empty) from the lowest color to the highest: a counting sort on the
 * colormap entry `colorBucket(t)`, pixels in index order within an entry. As `colorBucket` never
 * decreases with `t`, this is sorting by `t` with the pixels of one entry reordered; those paint the same
 * color and an overlap keeps the highest coverage, so the painted image does not depend on their order.
 */
export function pixelsByColor(t: Float64Array): Int32Array {
  const start = new Int32Array(257);
  for (let p = 0; p < t.length; p++) {
    const v = t[p] as number;
    if (!Number.isNaN(v)) {
      const b = colorBucket(v) + 1;
      start[b] = (start[b] as number) + 1;
    }
  }
  for (let b = 0; b < 256; b++) start[b + 1] = (start[b + 1] as number) + (start[b] as number);
  const out = new Int32Array(start[256] as number);
  for (let p = 0; p < t.length; p++) {
    const v = t[p] as number;
    if (Number.isNaN(v)) continue;
    const b = colorBucket(v);
    out[start[b] as number] = p;
    start[b] = (start[b] as number) + 1;
  }
  return out;
}
