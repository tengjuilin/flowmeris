import { bin2d } from '@flowmeris/density';
import { Rng } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { binTwice } from './bins.ts';

describe('binTwice', () => {
  it('gives both grids and the density grid stats exactly as bin2d does', () => {
    const rng = new Rng(5);
    const edges = [0, 0.25, 1, -1e-300, 1 + 1e-15, Number.NaN, Number.POSITIVE_INFINITY, -0];
    const pick = () =>
      rng.next() < 0.2 ? edges[Math.floor(rng.next() * edges.length)]! : rng.next() * 1.4 - 0.2;
    const n = 20000;
    const x = Float64Array.from({ length: n }, pick);
    const y = Float64Array.from({ length: n }, pick);
    for (const indices of [null, Int32Array.from({ length: 5000 }, () => Math.floor(rng.next() * n))]) {
      const inp = {
        x,
        y,
        indices,
        xRange: [0, 1] as [number, number],
        yRange: [-0.1, 0.9] as [number, number],
      };
      const got = binTwice(inp, 333, 217, 256);
      const px = bin2d(x, y, indices, inp.xRange, inp.yRange, 333, 217);
      const dens = bin2d(x, y, indices, inp.xRange, inp.yRange, 256, 256);
      expect(got.pixels).toEqual(px.grid.values);
      expect(got.density).toEqual(dens.grid.values);
      expect(got.stats).toEqual(dens.stats);
    }
  });
});
