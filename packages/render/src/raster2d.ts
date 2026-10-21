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
import { channelColorAtPixels, pixelsByValue } from './channelColor.ts';
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
  const cover = (d: number) => Math.max(0, Math.min(d + 1, hi) - Math.max(d, lo));
  const reach = Math.ceil(size / 2);
  for (let dy = -reach; dy <= reach; dy++) {
    const yy = py + dy;
    const cy = cover(dy);
    if (yy < 0 || yy >= h || cy <= 0) continue;
    for (let dx = -reach; dx <= reach; dx++) {
      const xx = px + dx;
      const c = cy * cover(dx);
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

/** An RGB color, 0–255 per channel. */
type Rgb = [number, number, number];

/**
 * The smoothed density on the fixed grid (M-PLOT-SMOOTH): σ is `smoothPct` % of each axis's range, at least
 * `minBins` bins.
 */
function densityGrid(inp: Raster2DInput, minBins: number): { grid: Grid2D; stats: BinStats } {
  const { grid, stats } = bin2d(
    inp.x,
    inp.y,
    inp.indices,
    inp.xRange,
    inp.yRange,
    DENSITY_BINS,
    DENSITY_BINS,
  );
  const sigma = Math.max((inp.style.smoothPct / 100) * DENSITY_BINS, minBins);
  return { grid: smooth2d(grid, sigma), stats };
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
  const at = (i: number, j: number) => g.values[j * g.nx + i] as number;
  return (
    (1 - ty) * ((1 - tx) * at(x0, y0) + tx * at(x1, y0)) + ty * ((1 - tx) * at(x0, y1) + tx * at(x1, y1))
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
function setPixel(rgba: Uint8ClampedArray, w: number, h: number, gx: number, gy: number, [r, g, b]: Rgb) {
  const o = ((h - 1 - gy) * w + gx) * 4;
  rgba[o] = r;
  rgba[o + 1] = g;
  rgba[o + 2] = b;
  rgba[o + 3] = 255;
}

/** One point per occupied pixel, `size` px wide, in the color `colorAt` gives it (null = none). */
function paintPoints(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  counts: Float64Array,
  size: number,
  colorAt: (i: number) => Rgb | null,
) {
  for (let gy = 0; gy < h; gy++)
    for (let gx = 0; gx < w; gx++) {
      const i = gy * w + gx;
      if (!((counts[i] as number) > 0)) continue;
      const c = colorAt(i);
      if (c) putPixel(rgba, w, h, gx, h - 1 - gy, c[0], c[1], c[2], size);
    }
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
    const rgb: Rgb = [
      Math.round(fr + (br - fr) * t),
      Math.round(fg + (bg - fg) * t),
      Math.round(fb + (bb - fb) * t),
    ];
    setPixel(rgba, w, h, i % w, Math.floor(i / w), rgb);
  }
}

const maxOf = (v: Float64Array) => {
  let m = 0;
  for (let i = 0; i < v.length; i++) if ((v[i] as number) > m) m = v[i] as number;
  return m;
};

/**
 * A 2D plot's image at `width` × `height` px. Its density is estimated on a fixed grid and its point sizes
 * are px at the reference plot width, scaled with `width`: the same plot drawn at any size, or exported at
 * any DPI, is the same picture.
 */
export function raster2d(inp: Raster2DInput): Raster2DOutput {
  const { width: w, height: h, style } = inp;
  // Occupied image pixels: where points (dots, pseudocolor, outliers) are drawn.
  const pixels = bin2d(inp.x, inp.y, inp.indices, inp.xRange, inp.yRange, w, h);
  const counts = pixels.grid.values;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const scale = w / REFERENCE_PLOT_PX;
  const lut = colormapLut(style.colormap);
  const mapColor = (t: number): Rgb => {
    const i = Math.max(0, Math.min(255, Math.round(t * 255)));
    return [lut[i * 3]!, lut[i * 3 + 1]!, lut[i * 3 + 2]!];
  };
  const point = style.pointPx * scale;

  if (inp.kind === 'dot') {
    const dot = hex(inp.dotColor);
    paintPoints(rgba, w, h, counts, point, () => dot);
    return { width: w, height: h, rgba, contours: [], stats: densityGrid(inp, 0).stats };
  }
  if (inp.kind === 'pseudocolor-channel') {
    if (!inp.color) throw new Error('A Pseudocolor channel plot needs a color channel');
    const { values, range, stat } = inp.color;
    const t = channelColorAtPixels({ ...inp, c: values, cRange: range, stat });
    // Lowest values first, so the points of the highest are drawn over the others.
    for (const i of pixelsByValue(t)) {
      const [r, g, b] = mapColor(t[i] as number);
      putPixel(rgba, w, h, i % w, h - 1 - Math.floor(i / w), r, g, b, point);
    }
    return { width: w, height: h, rgba, contours: [], stats: pixels.stats };
  }
  const isContour = inp.kind === 'contour' || inp.kind === 'zebra';
  const { grid: dens, stats } = densityGrid(inp, inp.kind === 'pseudocolor' ? 0 : 1);
  const atPx = densityAtPixels(dens, w, h);
  const max = maxOf(dens.values);
  let contours: ContourLine[] = [];

  if (inp.kind === 'pseudocolor') {
    // M-PLOT-PSEUDO: each occupied pixel colored by log(1 + local density) / log(1 + max).
    const lmax = Math.log1p(max);
    paintPoints(rgba, w, h, counts, point, (i) =>
      mapColor(lmax > 0 ? Math.log1p(atPx[i] as number) / lmax : 0),
    );
  } else if (inp.kind === 'density') {
    // M-PLOT-DENSITY: linear color scale; pixels below 0.5% of the maximum are left transparent.
    for (let i = 0; i < atPx.length; i++) {
      const d = atPx[i] as number;
      if (max > 0 && d >= 0.005 * max) setPixel(rgba, w, h, i % w, Math.floor(i / w), mapColor(d / max));
    }
  } else if (isContour) {
    const levels = levelsOf(dens, style);
    if (inp.kind === 'zebra') paintZebra(rgba, w, h, atPx, levels, max, style.zebraColors);
    if (inp.kind === 'contour' || style.zebraLines) contours = contourLines(dens, levels);
    const lowest = levels[0];
    if (style.showOutliers && lowest !== undefined) {
      const out = hex(style.outlierColor);
      paintPoints(rgba, w, h, counts, style.outlierPx * scale, (i) =>
        (atPx[i] as number) < lowest ? out : null,
      );
    }
  }
  return { width: w, height: h, rgba, contours, stats };
}
