import {
  type BinStats,
  type ContourLine,
  type Grid2D,
  bin2d,
  contourLines,
  equalProbabilityLevels,
  logContourLevels,
  smooth2d,
} from '@flowmeris/density';
import { type ColorStat, type PlotStyle, REFERENCE_PLOT_PX } from '@flowmeris/model';
import { binTwice } from './bins.ts';
import { channelColorAtPixels, colorBucket, pixelsByColor } from './channelColor.ts';
import { colormapLut, hex } from './colormaps.ts';

// ---------------------------------------------------------------------------
// 2D rasters
// ---------------------------------------------------------------------------

export interface Raster2DInput {
  kind: 'dot' | 'pseudocolor' | 'pseudocolor-channel' | 'density' | 'contour' | 'zebra';
  width: number;
  height: number;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** Event indices to plot (null = all). */
  indices: ArrayLike<number> | null;
  xRange: [number, number];
  yRange: [number, number];
  style: PlotStyle;
  /** Dot color (#rrggbb); outliers take the style's. */
  dotColor: string;
  /** Pseudocolor channel plots: the color channel's values (transformed), its range and statistic. */
  color?: { values: ArrayLike<number>; range: [number, number]; stat: ColorStat };
}

export interface Raster2DOutput {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  contours: ContourLine[];
  stats: BinStats;
}

/** How much of the pixel [d, d + 1) the span [lo, hi] covers. */
function cover(d: number, lo: number, hi: number): number {
  return Math.max(0, Math.min(d + 1, hi) - Math.max(d, lo));
}

/**
 * Paint a square point `size` px wide centered on pixel (px, py). A fractional size covers its edge
 * pixels partly; their alpha is that coverage (kept at the highest of overlapping points).
 */
function putPixel(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  px: number,
  py: number,
  r: number,
  g: number,
  b: number,
  size: number,
) {
  const lo = 0.5 - size / 2;
  const hi = 0.5 + size / 2;
  const reach = Math.ceil(size / 2);
  for (let dy = -reach; dy <= reach; dy++) {
    const yy = py + dy;
    const cy = cover(dy, lo, hi);
    if (yy < 0 || yy >= h || cy <= 0) continue;
    for (let dx = -reach; dx <= reach; dx++) {
      const xx = px + dx;
      const c = cy * cover(dx, lo, hi);
      if (xx < 0 || xx >= w || c <= 0) continue;
      const o = (yy * w + xx) * 4;
      const a = Math.round(c * 255);
      if (a < (rgba[o + 3] as number)) continue;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
    }
  }
}

/**
 * Bins per axis of the density grid (M-PLOT-BIN). Fixed, so the density, its colors and its contours do not
 * depend on the size the plot is drawn at.
 */
export const DENSITY_BINS = 256;

/**
 * The smoothed density on the fixed grid (M-PLOT-SMOOTH): σ is `smoothPct` % of each axis's range, at least
 * `minBins` bins.
 */
function smoothDensity(grid: Grid2D, style: PlotStyle, minBins: number): Grid2D {
  return smooth2d(grid, Math.max((style.smoothPct / 100) * DENSITY_BINS, minBins));
}

/** Contour levels of a density (M-PLOT-CONTOUR-EQP, -LOG). */
function levelsOf(dens: Grid2D, style: PlotStyle): number[] {
  return style.contour.mode === 'equal-prob'
    ? equalProbabilityLevels(dens.values, style.contour.pct / 100)
    : logContourLevels(dens.values, style.contour.levels);
}

/**
 * The grid's value at (fx, fy) in cell units, cell i's value sitting at i (as marching squares places it,
 * so the bands' edges meet the contour lines), interpolated bilinearly and clamped at the edges.
 */
export function bilinear(g: Grid2D, fx: number, fy: number): number {
  const x = Math.max(0, Math.min(g.nx - 1, fx));
  const y = Math.max(0, Math.min(g.ny - 1, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(g.nx - 1, x0 + 1);
  const y1 = Math.min(g.ny - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const v = g.values;
  const r0 = y0 * g.nx;
  const r1 = y1 * g.nx;
  return (
    (1 - ty) * ((1 - tx) * (v[r0 + x0] as number) + tx * (v[r0 + x1] as number)) +
    ty * ((1 - tx) * (v[r1 + x0] as number) + tx * (v[r1 + x1] as number))
  );
}

/** The density at the center of every image pixel, row 0 = lowest y (as the grids). */
function densityAtPixels(dens: Grid2D, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  for (let gy = 0; gy < h; gy++) {
    const fy = ((gy + 0.5) * dens.ny) / h - 0.5;
    for (let gx = 0; gx < w; gx++) out[gy * w + gx] = bilinear(dens, ((gx + 0.5) * dens.nx) / w - 0.5, fy);
  }
  return out;
}

/** Writes one opaque pixel; `gy` counts from the lowest y, image row 0 is the top. */
function setPixel(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  gx: number,
  gy: number,
  r: number,
  g: number,
  b: number,
) {
  const o = ((h - 1 - gy) * w + gx) * 4;
  rgba[o] = r;
  rgba[o + 1] = g;
  rgba[o + 2] = b;
  rgba[o + 3] = 255;
}

/**
 * One point per occupied pixel, `size` px wide, in one color; with `below`, only the pixels whose
 * density `atPx` is below `below.level` (outliers).
 */
function paintPoints(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  counts: Float64Array,
  size: number,
  [r, g, b]: [number, number, number],
  below?: { atPx: Float64Array; level: number },
) {
  for (let gy = 0; gy < h; gy++)
    for (let gx = 0; gx < w; gx++) {
      const i = gy * w + gx;
      if (!((counts[i] as number) > 0)) continue;
      if (below && !((below.atPx[i] as number) < below.level)) continue;
      putPixel(rgba, w, h, gx, h - 1 - gy, r, g, b, size);
    }
}

/** The offset in a colormap LUT of a position `t` on the color scale (0–1, clamped to the 256 entries). */
function lutIndex(t: number): number {
  return colorBucket(t) * 3;
}

/**
 * M-PLOT-ZEBRA: each band between contour levels filled with a gradient from the first zebra color at its
 * outer line to the second at its inner line (the densest band: at the highest density).
 */
function paintZebra(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  atPx: Float64Array,
  levels: number[],
  max: number,
  colors: [string, string],
) {
  const n = levels.length;
  const edges = [...levels, max];
  const [fr, fg, fb] = hex(colors[0]);
  const [br, bg, bb] = hex(colors[1]);
  for (let i = 0; i < atPx.length; i++) {
    const d = atPx[i] as number;
    if (n === 0 || d < (edges[0] as number)) continue;
    let k = 1;
    while (k < n && d >= (edges[k] as number)) k++;
    const lo = edges[k - 1] as number;
    const hi = edges[k] as number;
    const t = hi > lo ? Math.min(1, (d - lo) / (hi - lo)) : 0;
    setPixel(
      rgba,
      w,
      h,
      i % w,
      Math.floor(i / w),
      Math.round(fr + (br - fr) * t),
      Math.round(fg + (bg - fg) * t),
      Math.round(fb + (bb - fb) * t),
    );
  }
}

const maxOf = (v: Float64Array) => {
  let m = 0;
  for (let i = 0; i < v.length; i++) if ((v[i] as number) > m) m = v[i] as number;
  return m;
};

/** M-PLOT-PSEUDO: each occupied pixel colored by log(1 + local density) / log(1 + max). */
function paintPseudocolor(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  counts: Float64Array,
  atPx: Float64Array,
  max: number,
  lut: Uint8Array,
  size: number,
) {
  const lmax = Math.log1p(max);
  for (let gy = 0; gy < h; gy++)
    for (let gx = 0; gx < w; gx++) {
      const i = gy * w + gx;
      if (!((counts[i] as number) > 0)) continue;
      const c = lutIndex(lmax > 0 ? Math.log1p(atPx[i] as number) / lmax : 0);
      putPixel(rgba, w, h, gx, h - 1 - gy, lut[c]!, lut[c + 1]!, lut[c + 2]!, size);
    }
}

/** M-PLOT-DENSITY: linear color scale; pixels below 0.5% of the maximum are left transparent. */
function paintDensity(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  atPx: Float64Array,
  max: number,
  lut: Uint8Array,
) {
  for (let i = 0; i < atPx.length; i++) {
    const d = atPx[i] as number;
    if (!(max > 0 && d >= 0.005 * max)) continue;
    const c = lutIndex(d / max);
    setPixel(rgba, w, h, i % w, Math.floor(i / w), lut[c]!, lut[c + 1]!, lut[c + 2]!);
  }
}

/**
 * A 2D plot's image at `width` × `height` px. Its density is estimated on a fixed grid and its point sizes
 * are px at the reference plot width, scaled with `width`: the same plot drawn at any size, or exported at
 * any DPI, is the same picture.
 */
export function raster2d(inp: Raster2DInput): Raster2DOutput {
  if (inp.kind === 'pseudocolor-channel') return channelRaster(inp);
  const { width: w, height: h, style } = inp;
  // Occupied image pixels (where points are drawn) and the fixed density grid, binned in one pass.
  const bins = binTwice(inp, w, h, DENSITY_BINS);
  const counts = bins.pixels;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const scale = w / REFERENCE_PLOT_PX;
  const lut = colormapLut(style.colormap);
  const point = style.pointPx * scale;
  const stats = bins.stats;

  if (inp.kind === 'dot') {
    paintPoints(rgba, w, h, counts, point, hex(inp.dotColor));
    return { width: w, height: h, rgba, contours: [], stats };
  }
  const isContour = inp.kind === 'contour' || inp.kind === 'zebra';
  const grid: Grid2D = {
    nx: DENSITY_BINS,
    ny: DENSITY_BINS,
    values: bins.density,
    x: inp.xRange,
    y: inp.yRange,
  };
  const dens = smoothDensity(grid, style, inp.kind === 'pseudocolor' ? 0 : 1);
  const atPx = densityAtPixels(dens, w, h);
  const max = maxOf(dens.values);
  let contours: ContourLine[] = [];

  if (inp.kind === 'pseudocolor') paintPseudocolor(rgba, w, h, counts, atPx, max, lut, point);
  else if (inp.kind === 'density') paintDensity(rgba, w, h, atPx, max, lut);
  else if (isContour) {
    const levels = levelsOf(dens, style);
    if (inp.kind === 'zebra') paintZebra(rgba, w, h, atPx, levels, max, style.zebraColors);
    if (inp.kind === 'contour' || style.zebraLines) contours = contourLines(dens, levels);
    const lowest = levels[0];
    if (style.showOutliers && lowest !== undefined)
      paintPoints(rgba, w, h, counts, style.outlierPx * scale, hex(style.outlierColor), {
        atPx,
        level: lowest,
      });
  }
  return { width: w, height: h, rgba, contours, stats };
}

/** M-PLOT-PSEUDO-CHANNEL: each occupied pixel colored by its events' statistic of the color channel. */
function channelRaster(inp: Raster2DInput): Raster2DOutput {
  if (!inp.color) throw new Error('A Pseudocolor channel plot needs a color channel');
  const { width: w, height: h, style } = inp;
  const { stats } = bin2d(inp.x, inp.y, inp.indices, inp.xRange, inp.yRange, w, h);
  const rgba = new Uint8ClampedArray(w * h * 4);
  const lut = colormapLut(style.colormap);
  const point = style.pointPx * (w / REFERENCE_PLOT_PX);
  const { values, range, stat } = inp.color;
  const t = channelColorAtPixels({ ...inp, c: values, cRange: range, stat });
  // Lowest colors first, so the points of the highest are drawn over the others.
  for (const i of pixelsByColor(t)) {
    const c = lutIndex(t[i] as number);
    putPixel(rgba, w, h, i % w, h - 1 - Math.floor(i / w), lut[c]!, lut[c + 1]!, lut[c + 2]!, point);
  }
  return { width: w, height: h, rgba, contours: [], stats };
}
