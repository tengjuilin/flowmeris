import {
  type BinStats,
  type ContourLine,
  type Grid2D,
  bin1d,
  bin2d,
  contourLines,
  equalProbabilityLevels,
  logContourLevels,
  smooth1d,
  smooth2d,
} from '@flowmeris/density';
import type { PlotStyle } from '@flowmeris/model';

/**
 * CPU plot rasteriser (ADR-0001). Produces an RGBA image at pixel resolution
 * plus vector overlays (contour lines). Deterministic: identical input gives
 * byte-identical output, which the golden-image tests rely on.
 */

// ---------------------------------------------------------------------------
// Colormaps — sequential, single perceptual ramp by default (viridis).
// "classic" reproduces the blue→red pseudocolor familiar from FlowJo; it is not
// perceptually uniform and is offered for familiarity only (docs/methods/plots.md).
// ---------------------------------------------------------------------------

const STOPS: Record<string, string[]> = {
  viridis: [
    '#440154',
    '#482878',
    '#3e4989',
    '#31688e',
    '#26828e',
    '#1f9e89',
    '#35b779',
    '#6ece58',
    '#fde725',
  ],
  magma: ['#000004', '#1c1044', '#4f127b', '#812581', '#b5367a', '#e55064', '#fb8761', '#fec287', '#fcfdbf'],
  classic: [
    '#0000ff',
    '#00a0ff',
    '#00ffff',
    '#00ff80',
    '#00ff00',
    '#a0ff00',
    '#ffff00',
    '#ff8000',
    '#ff0000',
  ],
  gray: ['#d9d9d9', '#000000'],
};

export const COLORMAPS = Object.keys(STOPS);

function hex(h: string): [number, number, number] {
  return [
    Number.parseInt(h.slice(1, 3), 16),
    Number.parseInt(h.slice(3, 5), 16),
    Number.parseInt(h.slice(5, 7), 16),
  ];
}

const LUT_CACHE = new Map<string, Uint8Array>();

/** 256-entry RGB lookup table, linear interpolation between stops. */
export function colormapLut(name: string): Uint8Array {
  const hit = LUT_CACHE.get(name);
  if (hit) return hit;
  const stops = (STOPS[name] ?? STOPS.viridis!).map(hex);
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(Math.floor(t), stops.length - 2);
    const f = t - k;
    const a = stops[k]!;
    const b = stops[k + 1]!;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(a[c]! + (b[c]! - a[c]!) * f);
  }
  LUT_CACHE.set(name, lut);
  return lut;
}

export function colormapCss(name: string, t: number): string {
  const lut = colormapLut(name);
  const i = Math.max(0, Math.min(255, Math.round(t * 255)));
  return `rgb(${lut[i * 3]},${lut[i * 3 + 1]},${lut[i * 3 + 2]})`;
}

/**
 * Population/gate colours: the validated 8-slot categorical palette, assigned
 * in fixed order (never cycled past 8 — additional populations reuse slot 8's
 * neutral fallback and rely on labels).
 */
export const CATEGORICAL = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];

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
  const half = (size - 1) >> 1;
  for (let dy = -half; dy < size - half; dy++) {
    const yy = py + dy;
    if (yy < 0 || yy >= h) continue;
    for (let dx = -half; dx < size - half; dx++) {
      const xx = px + dx;
      if (xx < 0 || xx >= w) continue;
      const o = (yy * w + xx) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
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

// ---------------------------------------------------------------------------
// PNG encoding (for exports): RGBA → PNG with pHYs DPI chunk, no dependencies.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** PNG scanlines (filter type 0) for RGBA pixels. */
export function pngScanlines(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return raw;
}

/** zlib stream made of stored (uncompressed) deflate blocks. */
export function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.ceil(raw.length / 65535) || 1;
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78;
  z[1] = 0x01;
  let p = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    z[p++] = b === blocks - 1 ? 1 : 0;
    z[p++] = len & 0xff;
    z[p++] = len >>> 8;
    z[p++] = ~len & 0xff;
    z[p++] = (~len >>> 8) & 0xff;
    z.set(raw.subarray(start, start + len), p);
    p += len;
  }
  const ad = adler32(raw);
  z[p++] = ad >>> 24;
  z[p++] = (ad >>> 16) & 0xff;
  z[p++] = (ad >>> 8) & 0xff;
  z[p++] = ad & 0xff;
  return z.subarray(0, p);
}

/** Assemble a PNG from a zlib-compressed scanline stream, with a pHYs chunk for `dpi`. */
export function assemblePng(zlib: Uint8Array, width: number, height: number, dpi = 300): Uint8Array {
  const chunks: [string, Uint8Array][] = [];
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  chunks.push(['IHDR', ihdr]);
  const phys = new Uint8Array(9);
  const ppm = Math.round(dpi / 0.0254);
  new DataView(phys.buffer).setUint32(0, ppm);
  new DataView(phys.buffer).setUint32(4, ppm);
  phys[8] = 1; // unit: metre
  chunks.push(['pHYs', phys]);
  chunks.push(['IDAT', zlib]);
  chunks.push(['IEND', new Uint8Array(0)]);
  const total = 8 + chunks.reduce((a, [, d]) => a + 12 + d.length, 0);
  const out = new Uint8Array(total);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  let o = 8;
  for (const [type, data] of chunks) {
    new DataView(out.buffer).setUint32(o, data.length);
    for (let i = 0; i < 4; i++) out[o + 4 + i] = type.charCodeAt(i);
    out.set(data, o + 8);
    new DataView(out.buffer).setUint32(o + 8 + data.length, crc32(out, o + 4, o + 8 + data.length));
    o += 12 + data.length;
  }
  return out;
}

/** Encode RGBA as PNG (uncompressed deflate blocks; deterministic) with a pHYs chunk for `dpi`. */
export function encodePng(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  dpi = 300,
): Uint8Array {
  return assemblePng(zlibStored(pngScanlines(rgba, width, height)), width, height, dpi);
}
