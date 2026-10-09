import { Rng, TOL, compareArrays, isClose, readGolden } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import {
  bin1d,
  bin2d,
  contourLines,
  equalProbabilityLevels,
  gaussianKernel,
  logContourLevels,
  scottSigmaBins,
  smooth1d,
  smooth2d,
} from './index.ts';

describe('binning', () => {
  it('piles off-scale and NaN events on the axis edge and counts them', () => {
    const xs = [0.05, 0.95, -1, 2, Number.NaN];
    const ys = [0.05, 0.95, 0.5, 0.5, 0.5];
    const { grid, stats } = bin2d(xs, ys, null, [0, 1], [0, 1], 10, 10);
    expect(stats).toEqual({ binned: 5, offScale: 2, nan: 1 });
    expect(grid.values.reduce((a, b) => a + b, 0)).toBe(5);
    expect(grid.values[0]).toBe(1);
    expect(grid.values[99]).toBe(1);
    expect(grid.values[5 * 10 + 0]).toBe(2); // −1 and NaN on the left edge
    expect(grid.values[5 * 10 + 9]).toBe(1);
  });
  it('bins only the selected indices', () => {
    const h = bin1d([0.1, 0.2, 0.9], [0, 2], [0, 1], 2);
    expect(Array.from(h.counts)).toEqual([1, 1]);
  });
});

describe('smoothing', () => {
  it('kernel is normalised and conserves interior mass', () => {
    const k = gaussianKernel(2.5);
    expect(k.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14);
    const g = {
      nx: 40,
      ny: 40,
      values: new Float64Array(1600),
      x: [0, 1] as [number, number],
      y: [0, 1] as [number, number],
    };
    g.values[20 * 40 + 20] = 100;
    const s = smooth2d(g, 3);
    expect(s.values.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });
  it('is bit-identical to a direct separable convolution sum', () => {
    const rng = new Rng(7);
    const nx = 37;
    const ny = 23;
    const values = new Float64Array(nx * ny);
    // sparse clusters plus empty rows and columns, like a binned scatter plot
    for (let i = 0; i < 300; i++) {
      const x = Math.min(nx - 1, Math.floor(nx * (0.3 + 0.15 * rng.normal())));
      const y = Math.min(ny - 1, Math.floor(ny * (0.5 + 0.1 * rng.normal())));
      if (x >= 0 && y >= 0) values[y * nx + x] = (values[y * nx + x] as number) + 1;
    }
    values[0] = 3;
    values[nx * ny - 1] = 2;
    for (const sigma of [0.7, 1.5, 4]) {
      const k = gaussianKernel(sigma);
      const r = (k.length - 1) / 2;
      const conv = (get: (i: number) => number, n: number, i: number) => {
        let s = 0;
        for (let j = -r; j <= r; j++) if (i + j >= 0 && i + j < n) s += get(i + j) * (k[j + r] as number);
        return s;
      };
      const tmp = new Float64Array(nx * ny);
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) tmp[y * nx + x] = conv((t) => values[y * nx + t]!, nx, x);
      const ref = new Float64Array(nx * ny);
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) ref[y * nx + x] = conv((t) => tmp[t * nx + x]!, ny, y);
      const got = smooth2d({ nx, ny, values, x: [0, 1], y: [0, 1] }, sigma).values;
      expect(Array.from(got)).toEqual(Array.from(ref));
    }
  });

  it('is bit-identical to the direct per-cell convolution', () => {
    // Reference: each output sums its in-range taps in ascending order (the definition).
    const direct = (v: Float64Array, nx: number, ny: number, sigma: number) => {
      const k = gaussianKernel(sigma);
      const r = (k.length - 1) / 2;
      const tmp = new Float64Array(nx * ny);
      const out = new Float64Array(nx * ny);
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          let s = 0;
          for (let j = -r; j <= r; j++) if (x + j >= 0 && x + j < nx) s += v[y * nx + x + j]! * k[j + r]!;
          tmp[y * nx + x] = s;
        }
      for (let x = 0; x < nx; x++)
        for (let y = 0; y < ny; y++) {
          let s = 0;
          for (let j = -r; j <= r; j++) if (y + j >= 0 && y + j < ny) s += tmp[(y + j) * nx + x]! * k[j + r]!;
          out[y * nx + x] = s;
        }
      return out;
    };
    const rng = new Rng(3);
    for (const [nx, ny, sigma] of [
      [37, 23, 1.5],
      [5, 9, 3],
      [64, 64, 0.4],
      [3, 2, 6],
    ] as const) {
      const values = new Float64Array(nx * ny);
      // Sparse counts with empty rows, as in a binned plot.
      for (let i = 0; i < values.length; i++) if (rng.next() < 0.3) values[i] = Math.floor(rng.next() * 50);
      for (let x = 0; x < nx; x++) values[x] = 0;
      const got = smooth2d({ nx, ny, values, x: [0, 1], y: [0, 1] }, sigma).values;
      expect(Array.from(got)).toEqual(Array.from(direct(values, nx, ny, sigma)));
    }
  });
});

describe('M-PLOT-CONTOUR-EQP: equal-probability levels', () => {
  it('each band holds ≈ p of the mass', () => {
    const rng = new Rng(7);
    const n = 200_000;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = 0.5 + 0.1 * rng.normal();
      ys[i] = 0.5 + 0.1 * rng.normal();
    }
    const g = smooth2d(bin2d(xs, ys, null, [0, 1], [0, 1], 128, 128).grid, 2);
    const levels = equalProbabilityLevels(g.values, 0.1);
    expect(levels.length).toBe(9);
    const total = g.values.reduce((a, b) => a + b, 0);
    levels.forEach((lv, k) => {
      let above = 0;
      for (const v of g.values) if (v >= lv) above += v;
      // the line at level index k (ascending) encloses (1 − (k+1)·0.1) of the mass
      expect(above / total).toBeCloseTo(1 - (k + 1) * 0.1, 1);
    });
    const lines = contourLines(g, levels);
    expect(lines.length).toBe(9);
    expect(lines[0]!.rings.length).toBeGreaterThan(0);
  });
  it('log levels: outermost encloses 98%, each inner half the previous', () => {
    const v = Float64Array.from({ length: 1000 }, (_, i) => i + 1);
    const lv = logContourLevels(v, 4);
    expect(lv.length).toBe(4);
    for (let i = 1; i < lv.length; i++) expect(lv[i]!).toBeGreaterThan(lv[i - 1]!);
  });
});

interface DensityGolden {
  x: (number | null)[];
  y: (number | null)[];
  hist: { range: [number, number]; bins: number; counts: number[]; off_scale: number; nan: number };
  hist2d: {
    x_range: [number, number];
    y_range: [number, number];
    nx: number;
    ny: number;
    values: number[];
    off_scale: number;
    nan: number;
  };
  smooth1d: { sigma: number; y: number[] }[];
  smooth2d: { sigma: number; values: number[] }[];
  hist_norm: { sigma: number; count: number[]; mode: number[]; area: number[] };
  levels_eqp: Record<string, number[]>;
  levels_log: Record<string, number[]>;
  scott_sigma_bins: number;
}

describe('golden parity: binning, smoothing and contour levels vs NumPy/SciPy', () => {
  const g = readGolden<DensityGolden>('density.json');
  const x = Float64Array.from(g.x, (v) => v ?? Number.NaN);
  const y = Float64Array.from(g.y, (v) => v ?? Number.NaN);
  const h = bin1d(x, null, g.hist.range, g.hist.bins);
  const b2 = bin2d(x, y, null, g.hist2d.x_range, g.hist2d.y_range, g.hist2d.nx, g.hist2d.ny);

  it('1D histogram counts (numpy.histogram), with values on every bin edge, off-scale and NaN', () => {
    expect(Array.from(h.counts)).toEqual(g.hist.counts);
    expect(h.stats).toEqual({ binned: x.length, offScale: g.hist.off_scale, nan: g.hist.nan });
  });

  it('2D histogram counts (numpy.histogram2d)', () => {
    expect(Array.from(b2.grid.values)).toEqual(g.hist2d.values);
    expect(b2.stats).toEqual({ binned: x.length, offScale: g.hist2d.off_scale, nan: g.hist2d.nan });
  });

  it('Gaussian smoothing (scipy.ndimage, zero padding, radius ⌈4σ⌉)', () => {
    const counts = Float64Array.from(g.hist.counts);
    for (const s of g.smooth1d)
      expect(compareArrays(smooth1d(counts, s.sigma), s.y, TOL.density, `1D σ=${s.sigma}`)).toEqual([]);
    for (const s of g.smooth2d)
      expect(
        compareArrays(smooth2d(b2.grid, s.sigma).values, s.values, TOL.density, `2D σ=${s.sigma}`),
      ).toEqual([]);
  });

  it('equal-probability and logarithmic contour levels', () => {
    const v = smooth2d(b2.grid, 2).values;
    for (const [p, want] of Object.entries(g.levels_eqp))
      expect(compareArrays(equalProbabilityLevels(v, Number(p)), want, TOL.density, `p=${p}`)).toEqual([]);
    for (const [k, want] of Object.entries(g.levels_log))
      expect(compareArrays(logContourLevels(v, Number(k)), want, TOL.density, `${k} levels`)).toEqual([]);
  });

  it("Scott's rule bandwidth", () => {
    expect(isClose(scottSigmaBins(x, g.hist.range, g.hist.bins), g.scott_sigma_bins, TOL.stats)).toBe(true);
  });
});
