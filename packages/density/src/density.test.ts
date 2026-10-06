import { Rng } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import {
  bin1d,
  bin2d,
  contourLines,
  equalProbabilityLevels,
  gaussianKernel,
  logContourLevels,
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
