import { describe, expect, it } from 'vitest';
import { legendGrid, legendMargins, legendOrigin } from './chartLegend.ts';

// At size 10 each entry is 9 (swatch) + 5 + 6 px per character wide, and rows are 10 + 8 px apart.
const names = ['aa', 'bb', 'cc', 'dd', 'ee'];
const entry = 9 + 5 + 12;

describe('chart legend grid', () => {
  it('above or below the plot: one row when it fits', () => {
    const g = legendGrid(names, 10, 'top', undefined, 1000);
    expect([g.cols, g.rows]).toEqual([5, 1]);
    expect(g.w).toBe(5 * entry + 4 * 16);
    expect(g.items.map((p) => p.y)).toEqual([0, 0, 0, 0, 0]);
  });

  it('above or below the plot: wraps to as many columns as fit, filling rows first', () => {
    const g = legendGrid(names, 10, 'bottom', undefined, 3 * entry + 2 * 16);
    expect([g.cols, g.rows]).toEqual([3, 2]);
    expect(g.items[3]).toEqual({ x: 0, y: 18 });
    expect(g.w).toBeLessThanOrEqual(3 * entry + 2 * 16);
    expect(legendGrid(names, 10, 'top', undefined, 5).cols).toBe(1);
  });

  it('beside or inside the plot: one column, wrapping to more when the plot is too short, columns first', () => {
    expect(legendGrid(names, 10, 'right', undefined, 1000).cols).toBe(1);
    const g = legendGrid(names, 10, 'left', undefined, 3 * 10 + 2 * 8);
    expect([g.cols, g.rows]).toEqual([2, 3]);
    expect(g.items[3]).toEqual({ x: entry + 16, y: 0 });
    expect(legendGrid(names, 10, 'inside-top-left', undefined, 10).cols).toBe(5);
  });

  it('a set number of columns is kept, within the number of entries', () => {
    expect(legendGrid(names, 10, 'top', 2, 10).cols).toBe(2);
    expect(legendGrid(names, 10, 'right', 2, 1000).rows).toBe(3);
    expect(legendGrid(names, 10, 'top', 9, 10).cols).toBe(5);
  });

  it('columns are as wide as their widest entry', () => {
    const g = legendGrid(['a', 'a much longer name'], 10, 'top', 2, 1000);
    expect(g.items[1]!.x).toBe(9 + 5 + 6 + 16);
  });
});

describe('chart legend placement', () => {
  const g = { w: 100, h: 30 };
  const a = { l: 50, t: 40, pw: 300, ph: 200, H: 300 };

  it('outside legends take room on their side; inside ones take none', () => {
    expect(legendMargins('top', g)).toEqual({ t: 44, r: 0, b: 0, l: 0 });
    expect(legendMargins('bottom', g).b).toBe(40);
    expect(legendMargins('left', g).l).toBe(116);
    expect(legendMargins('right', g).r).toBe(116);
    expect(legendMargins('inside-top-left', g)).toEqual({ t: 0, r: 0, b: 0, l: 0 });
  });

  it('aligns along the plot area: start, center or end', () => {
    expect(legendOrigin('top', 'start', g, a)).toEqual({ x: 50, y: 8 });
    expect(legendOrigin('bottom', 'center', g, a)).toEqual({ x: 150, y: 264 });
    expect(legendOrigin('right', 'end', g, a)).toEqual({ x: 366, y: 210 });
    expect(legendOrigin('left', 'center', g, a)).toEqual({ x: 6, y: 125 });
  });

  it('sits in its corner inside the plot area', () => {
    expect(legendOrigin('inside-top-left', 'start', g, a)).toEqual({ x: 64, y: 54 });
    expect(legendOrigin('inside-bottom-right', 'start', g, a)).toEqual({ x: 236, y: 196 });
  });
});
