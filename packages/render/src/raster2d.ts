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
import type { PlotStyle } from '@flowmeris/model';
import { colormapLut, hex } from './colormaps.ts';

// ---------------------------------------------------------------------------
// 2D rasters
// ---------------------------------------------------------------------------

export interface Raster2DInput {
  kind: 'dot' | 'pseudocolor' | 'density' | 'contour';
  width: number;
  height: number;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** Event indices to plot (null = all). */
  indices: ArrayLike<number> | null;
  xRange: [number, number];
  yRange: [number, number];
  style: PlotStyle;
  /** Dot / outlier colour (#rrggbb). */
  dotColor: string;
}

export interface Raster2DOutput {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  contours: ContourLine[];
  stats: BinStats;
  /** Smoothing σ used, in pixels (reported on the plot for transparency). */
  sigmaPx: number;
}

/**
 * Paint a square point `size` px wide centred on pixel (px, py). A fractional size covers its edge
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

export function raster2d(inp: Raster2DInput): Raster2DOutput {
  const { width: w, height: h, style } = inp;
  const { grid, stats } = bin2d(inp.x, inp.y, inp.indices, inp.xRange, inp.yRange, w, h);
  const rgba = new Uint8ClampedArray(w * h * 4);
  const [dr, dg, db] = hex(inp.dotColor);
  const sigma = style.smoothSigmaBins;
  const lut = colormapLut(style.colormap);
  let contours: ContourLine[] = [];

  // grid row 0 is the lowest y → image row h−1.
  const counts = grid.values;
  const px = style.pointPx;

  switch (inp.kind) {
    case 'dot':
      for (let gy = 0; gy < h; gy++) {
        const row = gy * w;
        for (let gx = 0; gx < w; gx++) {
          if (!((counts[row + gx] as number) > 0)) continue;
          if (px === 1) {
            const o = ((h - 1 - gy) * w + gx) * 4;
            rgba[o] = dr;
            rgba[o + 1] = dg;
            rgba[o + 2] = db;
            rgba[o + 3] = 255;
          } else putPixel(rgba, w, h, gx, h - 1 - gy, dr, dg, db, px);
        }
      }
      break;
    case 'pseudocolor': {
      // M-PLOT-PSEUDO: each occupied pixel coloured by log(1 + local density) / log(1 + max).
      const dens = sigma > 0 ? smooth2d(grid, sigma).values : counts;
      let max = 0;
      for (let i = 0; i < dens.length; i++) if ((dens[i] as number) > max) max = dens[i] as number;
      const lmax = Math.log1p(max);
      for (let gy = 0; gy < h; gy++) {
        const row = gy * w;
        for (let gx = 0; gx < w; gx++) {
          if (!((counts[row + gx] as number) > 0)) continue;
          const d = dens[row + gx] as number;
          const t = lmax > 0 ? Math.log1p(d) / lmax : 0;
          const i = Math.max(0, Math.min(255, Math.round(t * 255)));
          if (px === 1) {
            const o = ((h - 1 - gy) * w + gx) * 4;
            rgba[o] = lut[i * 3]!;
            rgba[o + 1] = lut[i * 3 + 1]!;
            rgba[o + 2] = lut[i * 3 + 2]!;
            rgba[o + 3] = 255;
          } else putPixel(rgba, w, h, gx, h - 1 - gy, lut[i * 3]!, lut[i * 3 + 1]!, lut[i * 3 + 2]!, px);
        }
      }
      break;
    }
    case 'density': {
      // M-PLOT-DENSITY: smoothed density image, linear colour scale; cells below
      // 0.5% of the maximum are left transparent.
      const dens = smooth2d(grid, Math.max(sigma, 1));
      let max = 0;
      for (const v of dens.values) if (v > max) max = v;
      for (let gy = 0; gy < h; gy++)
        for (let gx = 0; gx < w; gx++) {
          const d = dens.values[gy * w + gx] as number;
          if (max === 0 || d < 0.005 * max) continue;
          const i = Math.round((d / max) * 255);
          const o = ((h - 1 - gy) * w + gx) * 4;
          rgba[o] = lut[i * 3]!;
          rgba[o + 1] = lut[i * 3 + 1]!;
          rgba[o + 2] = lut[i * 3 + 2]!;
          rgba[o + 3] = 255;
        }
      break;
    }
    case 'contour': {
      // Contours are computed on a coarser grid (≈ 3 px cells) for smooth lines.
      const cell = 3;
      const cg = bin2d(
        inp.x,
        inp.y,
        inp.indices,
        inp.xRange,
        inp.yRange,
        Math.ceil(w / cell),
        Math.ceil(h / cell),
      ).grid;
      const dens: Grid2D = smooth2d(cg, Math.max(sigma / cell, 1));
      const levels =
        style.contour.mode === 'equal-prob'
          ? equalProbabilityLevels(dens.values, style.contour.pct / 100)
          : logContourLevels(dens.values, style.contour.levels);
      contours = contourLines(dens, levels);
      if (style.showOutliers && levels.length > 0) {
        const lowest = levels[0] as number;
        for (let gy = 0; gy < h; gy++) {
          const cy = Math.min(dens.ny - 1, Math.floor(gy / cell));
          for (let gx = 0; gx < w; gx++) {
            if (!((counts[gy * w + gx] as number) > 0)) continue;
            const cx = Math.min(dens.nx - 1, Math.floor(gx / cell));
            if ((dens.values[cy * dens.nx + cx] as number) < lowest)
              putPixel(rgba, w, h, gx, h - 1 - gy, dr, dg, db, px);
          }
        }
      }
      break;
    }
  }
  return { width: w, height: h, rgba, contours, stats, sigmaPx: inp.kind === 'dot' ? 0 : sigma };
}
