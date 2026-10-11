import { describe, expect, it } from 'vitest';
import { legendExtent, plotArea } from './chartLayout.ts';
import { markerPath, meanLineLength } from './chartMarks.ts';
import { DEFAULT_CHART_STYLE } from './chartStyle.ts';

/** Area of a closed polygon path of M/L/H/V commands (shoelace). */
function area(d: string) {
  const pts: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const [, c, a, b] of d.matchAll(/([MLHV])([-\d.]+)(?:,([-\d.]+))?/g)) {
    if (c === 'H') x = Number(a);
    else if (c === 'V') y = Number(a);
    else [x, y] = [Number(a), Number(b)];
    pts.push([x, y]);
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    s += x0 * y1 - x1 * y0;
  }
  return Math.abs(s) / 2;
}

describe('chart marks', () => {
  it.each(['square', 'triangle', 'diamond'] as const)(
    'a %s has the area of the circle of radius r',
    (shape) => {
      expect(area(markerPath(shape, 50, 50, 10))).toBeCloseTo(Math.PI * 100, 0);
    },
  );

  it('a triangle is centered on its centroid, pointing up', () => {
    const d = markerPath('triangle', 0, 0, 6);
    const ys = [...d.matchAll(/,([-\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys[0]).toBeLessThan(0);
    expect(ys.reduce((a, b) => a + b, 0) / 3).toBeCloseTo(0, 1);
  });

  it('a horizontal-line marker spans the slot unless its length is set', () => {
    expect(meanLineLength(DEFAULT_CHART_STYLE, true, 24)).toBe(24);
    expect(meanLineLength(DEFAULT_CHART_STYLE, true, 4)).toBe(12);
    expect(meanLineLength(DEFAULT_CHART_STYLE, false, 0)).toBe(16);
    expect(meanLineLength({ ...DEFAULT_CHART_STYLE, meanLineLength: 30 }, true, 24)).toBe(30);
  });
});

describe('plot area', () => {
  const m = { l: 40, r: 20, t: 10, b: 30 };
  it('fills the chart without an aspect ratio', () => {
    expect(plotArea(460, 340, m, undefined)).toEqual({ pw: 400, ph: 300, W: 460, H: 340 });
  });

  it('with an aspect ratio, is the largest box of that shape that fits, and the chart shrinks to it', () => {
    expect(plotArea(460, 340, m, 1)).toEqual({ pw: 300, ph: 300, W: 360, H: 340 });
    expect(plotArea(460, 340, m, 2)).toEqual({ pw: 400, ph: 200, W: 460, H: 240 });
  });
});

describe('legend room', () => {
  it('a row legend needs the width of its entries; a column legend the height of its rows', () => {
    const top = legendExtent(['ctrl', 'drug'], 10, 'top');
    expect(top.w).toBeCloseTo(2 * (9 + 18 + 24) - 13, 6);
    expect(legendExtent(['a', 'b', 'c'], 12, 'right').h).toBe(60);
  });

  it('the chart is never smaller than the legend needs, whatever the aspect ratio', () => {
    const m = { l: 40, r: 20, t: 30, b: 30 };
    const tall = plotArea(460, 340, m, 0.2, { W: 300, H: 0 });
    expect(tall.W).toBe(300);
    expect(tall.pw).toBeCloseTo(56, 6);
    expect(plotArea(460, 340, m, 5, { W: 0, H: 400 }).H).toBe(400);
  });
});
