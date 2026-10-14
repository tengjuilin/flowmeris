import { inflateSync } from 'node:zlib';
import { type PlotStyle, sha256Hex } from '@flowmeris/model';
import { Rng, TOL, compareArrays, readGolden } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import {
  bilinear,
  colormapLut,
  encodePng,
  encodePngCompressed,
  histogram,
  pngScanlines,
  raster2d,
} from './index.ts';

const style = {
  colormap: 'viridis',
  pointPx: 1,
  smoothSigmaBins: 2,
  contour: { mode: 'equal-prob' as const, pct: 5 as const },
  showOutliers: true,
  zebraLines: true,
  zebraColors: ['#0000ff', '#ffffff'] as [string, string],
  histBins: 64,
  histNorm: 'mode' as const,
  histSmooth: false,
};

function data(n: number) {
  const rng = new Rng(3);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = 0.5 + 0.12 * rng.normal();
    y[i] = 0.4 + 0.08 * rng.normal();
  }
  return { x, y };
}

describe('raster2d', () => {
  it.each(['dot', 'pseudocolor', 'density', 'contour', 'zebra'] as const)('%s is deterministic', (kind) => {
    const { x, y } = data(20000);
    const run = () =>
      raster2d({
        kind,
        width: 120,
        height: 100,
        x,
        y,
        indices: null,
        xRange: [0, 1],
        yRange: [0, 1],
        style,
        dotColor: '#333333',
      });
    const a = run();
    const b = run();
    const h = (r: typeof a) => sha256Hex(Array.from(r.rgba).join(','));
    expect(h(a)).toBe(h(b));
    expect(a.rgba.some((v) => v !== 0) || a.contours.length > 0).toBe(true);
    if (kind === 'contour' || kind === 'zebra') expect(a.contours.length).toBe(19);
  });
  describe('zebra (M-PLOT-ZEBRA)', () => {
    const { x, y } = data(20000);
    const zebra = (st: Partial<PlotStyle> = {}, kind: 'zebra' | 'contour' = 'zebra') =>
      raster2d({
        kind,
        width: 120,
        height: 100,
        x,
        y,
        indices: null,
        xRange: [0, 1],
        yRange: [0, 1],
        style: { ...style, ...st },
        dotColor: '#ff0000',
      });
    const rgbAt = (r: ReturnType<typeof zebra>, px: number, py: number) => {
      const o = (py * r.width + px) * 4;
      return [r.rgba[o], r.rgba[o + 1], r.rgba[o + 2], r.rgba[o + 3]];
    };

    it('draws the same contour lines as the contour plot', () => {
      expect(zebra().contours).toEqual(zebra({}, 'contour').contours);
    });

    /** New bands met walking right along image row `py` to `x1`: the gradient starts again at each line. */
    const restarts = (r: ReturnType<typeof zebra>, py: number, x1: number) => {
      let n = 0;
      for (let px = 1; px <= x1; px++) {
        const [prev, , , pa] = rgbAt(r, px - 1, py);
        const [cur] = rgbAt(r, px, py);
        if (pa && (cur as number) < (prev as number) - 60) n++;
      }
      return n;
    };

    it('fills each band with its own gradient, from the first color at its outer line to the second', () => {
      const r = zebra({ showOutliers: false });
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < r.rgba.length; i += 4) {
        if (!r.rgba[i + 3]) continue;
        // Blue → white: red equals green, blue stays full.
        expect(r.rgba[i]).toBe(r.rgba[i + 1]);
        expect(r.rgba[i + 2]).toBe(255);
        lo = Math.min(lo, r.rgba[i]!);
        hi = Math.max(hi, r.rgba[i]!);
      }
      expect(lo).toBeLessThan(20);
      expect(hi).toBeGreaterThan(235);
      // From the left edge to the distribution's center (0.5, 0.4) → pixel (60, 60), y flipped.
      expect(restarts(r, 60, 60)).toBeGreaterThanOrEqual(5);
    });

    it('takes its two colors from the style', () => {
      const r = zebra({ showOutliers: false, zebraColors: ['#ff0000', '#00ff00'] });
      for (let i = 0; i < r.rgba.length; i += 4) {
        if (!r.rgba[i + 3]) continue;
        expect(r.rgba[i + 2]).toBe(0);
        expect(Math.abs(r.rgba[i]! + r.rgba[i + 1]! - 255)).toBeLessThanOrEqual(1);
      }
    });

    it('leaves the corners empty without outliers, and draws outliers in the dot color', () => {
      const off = zebra({ showOutliers: false });
      expect(rgbAt(off, 0, 0)[3]).toBe(0);
      const on = zebra({ showOutliers: true, pointPx: 1 });
      let red = 0;
      for (let i = 0; i < on.rgba.length; i += 4)
        if (on.rgba[i] === 255 && on.rgba[i + 1] === 0 && on.rgba[i + 2] === 0) red++;
      expect(red).toBeGreaterThan(0);
      // Outliers only add pixels outside the bands.
      for (let i = 0; i < off.rgba.length; i += 4)
        if (off.rgba[i + 3]) expect(on.rgba.slice(i, i + 4)).toEqual(off.rgba.slice(i, i + 4));
    });

    it('omits the lines when they are turned off, keeping the fill', () => {
      const r = zebra({ zebraLines: false });
      expect(r.contours).toEqual([]);
      expect(r.rgba).toEqual(zebra().rgba);
    });

    it('follows the logarithmic levels', () => {
      const r = zebra({ contour: { mode: 'log', levels: 4 }, showOutliers: false });
      expect(r.contours.length).toBe(4);
      // Four bands: the gradient starts again at the three inner lines.
      expect(restarts(r, 60, 60)).toBe(3);
    });

    it('draws nothing for an empty population', () => {
      const r = raster2d({
        kind: 'zebra',
        width: 20,
        height: 20,
        x,
        y,
        indices: [],
        xRange: [0, 1],
        yRange: [0, 1],
        style,
        dotColor: '#000000',
      });
      expect(r.contours).toEqual([]);
      expect(r.rgba.every((v) => v === 0)).toBe(true);
    });
  });

  it('bilinear interpolates between cell values and clamps at the edges', () => {
    const g = {
      nx: 2,
      ny: 2,
      values: Float64Array.from([0, 1, 2, 3]),
      x: [0, 1] as [number, number],
      y: [0, 1] as [number, number],
    };
    expect(bilinear(g, 0, 0)).toBe(0);
    expect(bilinear(g, 1, 1)).toBe(3);
    expect(bilinear(g, 0.5, 0.5)).toBe(1.5);
    expect(bilinear(g, 0.25, 0)).toBe(0.25);
    expect(bilinear(g, -5, 9)).toBe(2);
    const row = {
      nx: 3,
      ny: 1,
      values: Float64Array.from([0, 2, 4]),
      x: [0, 1] as [number, number],
      y: [0, 1] as [number, number],
    };
    expect(bilinear(row, 1.5, 0.7)).toBe(3);
  });

  it('flips y so high values are at the top of the image', () => {
    const r = raster2d({
      kind: 'dot',
      width: 10,
      height: 10,
      x: [0.05],
      y: [0.95],
      indices: null,
      xRange: [0, 1],
      yRange: [0, 1],
      style,
      dotColor: '#ff0000',
    });
    expect(r.rgba[0]).toBe(255); // top-left pixel
  });
});

describe('histogram & colormaps & PNG', () => {
  it('mode-normalized histogram peaks at 1', () => {
    const { x } = data(5000);
    const h = histogram(x, null, [0, 1], style);
    expect(Math.max(...h.heights)).toBe(1);
  });
  it('LUT has 256 entries starting at the first stop', () => {
    const l = colormapLut('viridis');
    expect(l.length).toBe(768);
    expect([l[0], l[1], l[2]]).toEqual([0x44, 0x01, 0x54]);
  });
  it('encodes a valid PNG signature with pHYs', () => {
    const png = encodePng(new Uint8ClampedArray(4 * 4 * 4).fill(200), 4, 4, 300);
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(new TextDecoder().decode(png.slice(37, 41))).toBe('pHYs');
  });
  it('compresses the same scanlines with native deflate', async () => {
    const rgba = Uint8ClampedArray.from({ length: 5 * 3 * 4 }, (_, i) => (i % 4) * 60);
    const plain = encodePng(rgba, 5, 3, 600);
    const png = await encodePngCompressed(rgba, 5, 3, 600);
    // Same signature, IHDR and pHYs; only the IDAT chunk differs.
    expect(png.slice(0, 54)).toEqual(plain.slice(0, 54));
    const idatLen = new DataView(png.buffer, png.byteOffset).getUint32(54);
    expect(new TextDecoder().decode(png.slice(58, 62))).toBe('IDAT');
    expect(new Uint8Array(inflateSync(png.slice(62, 62 + idatLen)))).toEqual(pngScanlines(rgba, 5, 3));
    expect(idatLen).toBeLessThan(new DataView(plain.buffer, plain.byteOffset).getUint32(54));
  });
});

describe('golden parity: histogram heights vs SciPy (smoothed, then count / % of max / fraction)', () => {
  const g = readGolden<{
    x: (number | null)[];
    hist: { range: [number, number]; bins: number };
    hist_norm: { sigma: number; count: number[]; mode: number[]; area: number[] };
  }>('density.json');
  const x = Float64Array.from(g.x, (v) => v ?? Number.NaN);
  for (const norm of ['count', 'mode', 'area'] as const)
    it(norm, () => {
      const h = histogram(x, null, g.hist.range, {
        histBins: g.hist.bins,
        histNorm: norm,
        histSmooth: true,
        histSigmaBins: g.hist_norm.sigma,
      });
      expect(compareArrays(h.heights, g.hist_norm[norm], TOL.density, norm)).toEqual([]);
      const bw = (g.hist.range[1] - g.hist.range[0]) / g.hist.bins;
      expect(h.centers[0]).toBe(g.hist.range[0] + 0.5 * bw);
    });
});
