import { inflateSync } from 'node:zlib';
import { sha256Hex } from '@flowmeris/model';
import { Rng, TOL, compareArrays, readGolden } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { colormapLut, encodePng, encodePngCompressed, histogram, pngScanlines, raster2d } from './index.ts';

const style = {
  colormap: 'viridis',
  pointPx: 1,
  smoothSigmaBins: 2,
  contour: { mode: 'equal-prob' as const, pct: 5 as const },
  showOutliers: true,
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
  it.each(['dot', 'pseudocolor', 'density', 'contour'] as const)('%s is deterministic', (kind) => {
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
    if (kind === 'contour') expect(a.contours.length).toBe(19);
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
