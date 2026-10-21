import { Rng } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { type ChannelColorInput, channelColorAtPixels } from './channelColor.ts';
import { colormapLut, raster2d } from './index.ts';

const style = {
  colormap: 'viridis',
  pointPx: 1,
  smoothPct: 0,
  contour: { mode: 'equal-prob' as const, pct: 5 as const },
  showOutliers: true,
  outlierPx: 2,
  outlierColor: '#ff0000',
  contourWidth: 1,
  zebraLines: true,
  zebraColors: ['#000000', '#ffffff'] as [string, string],
  histBins: 64,
  histNorm: 'mode' as const,
  histSmooth: false,
};

/** Reference: each pixel's events listed one by one, then the statistic as NumPy computes it. */
function reference(inp: ChannelColorInput): Float64Array {
  const { width: w, height: h } = inp;
  const lists: number[][] = Array.from({ length: w * h }, () => []);
  const n = inp.indices ? inp.indices.length : inp.x.length;
  const clampBin = (v: number, lo: number, hi: number, k: number) =>
    Number.isNaN(v) ? 0 : Math.max(0, Math.min(k - 1, Math.floor(((v - lo) / (hi - lo)) * k)));
  for (let k = 0; k < n; k++) {
    const i = inp.indices ? (inp.indices[k] as number) : k;
    const px = clampBin(inp.x[i] as number, inp.xRange[0], inp.xRange[1], w);
    const py = clampBin(inp.y[i] as number, inp.yRange[0], inp.yRange[1], h);
    const c = inp.c[i] as number;
    const t = Number.isNaN(c) ? 0 : (c - inp.cRange[0]) / (inp.cRange[1] - inp.cRange[0]);
    lists[py * w + px]!.push(Math.min(1, Math.max(0, t)));
  }
  return Float64Array.from(lists, (l) => {
    if (l.length === 0) return Number.NaN;
    const s = [...l].sort((a, b) => a - b);
    if (inp.stat === 'max') return s[s.length - 1]!;
    if (inp.stat === 'mean') return s.reduce((a, b) => a + b, 0) / s.length;
    const m = s.length >> 1;
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  });
}

function data(n: number) {
  const rng = new Rng(11);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = 0.5 + 0.2 * rng.normal();
    y[i] = 0.5 + 0.2 * rng.normal();
    c[i] = 0.3 + 0.4 * x[i]! + 0.1 * rng.normal();
  }
  return { x, y, c };
}

describe('channelColorAtPixels (M-PLOT-PSEUDO-CHANNEL)', () => {
  const { x, y, c } = data(5000);
  it.each(['median', 'mean', 'max'] as const)('%s of each pixel matches the reference', (stat) => {
    const inp: ChannelColorInput = {
      x,
      y,
      c,
      indices: null,
      xRange: [0.1, 0.9],
      yRange: [0.1, 0.9],
      cRange: [0.2, 0.8],
      stat,
      width: 12,
      height: 9,
    };
    const got = channelColorAtPixels(inp);
    const want = reference(inp);
    for (let p = 0; p < want.length; p++) {
      if (Number.isNaN(want[p]!)) expect(got[p]).toBeNaN();
      else expect(got[p]).toBeCloseTo(want[p]!, 12);
    }
  });

  it('uses only the indexed events and leaves empty pixels NaN', () => {
    const inp: ChannelColorInput = {
      x: [0.1, 0.1, 0.9, 0.9],
      y: [0.1, 0.1, 0.9, 0.1],
      c: [0, 1, 0.5, Number.NaN],
      indices: [0, 1, 3],
      xRange: [0, 1],
      yRange: [0, 1],
      cRange: [0, 1],
      stat: 'median',
      width: 2,
      height: 2,
    };
    // Pixel 0 (bottom left): median of 0 and 1; pixel 1 (bottom right): a NaN value piled on the minimum.
    expect(Array.from(channelColorAtPixels(inp))).toEqual([0.5, 0, Number.NaN, Number.NaN]);
  });

  it('piles values beyond the color range on its ends', () => {
    const inp: ChannelColorInput = {
      x: [0.2, 0.8],
      y: [0.5, 0.5],
      c: [-5, 5],
      indices: null,
      xRange: [0, 1],
      yRange: [0, 1],
      cRange: [0, 1],
      stat: 'mean',
      width: 2,
      height: 1,
    };
    expect(Array.from(channelColorAtPixels(inp))).toEqual([0, 1]);
  });
});

describe('raster2d pseudocolor-channel', () => {
  const lut = colormapLut('viridis');
  const rgbAt = (rgba: Uint8ClampedArray, w: number, px: number, row: number) =>
    Array.from(rgba.slice((row * w + px) * 4, (row * w + px) * 4 + 4));

  it('colors each point by the color map at its value, and draws the highest over the others', () => {
    // Two 3-px points one pixel apart: the higher value covers their shared pixels.
    const r = raster2d({
      kind: 'pseudocolor-channel',
      width: 400,
      height: 10,
      x: [100.5 / 400, 101.5 / 400],
      y: [0.55, 0.55],
      indices: null,
      xRange: [0, 1],
      yRange: [0, 1],
      style: { ...style, pointPx: 3 },
      dotColor: '#000000',
      color: { values: [1, 0], range: [0, 1], stat: 'median' },
    });
    const top = [lut[255 * 3]!, lut[255 * 3 + 1]!, lut[255 * 3 + 2]!, 255];
    const bottom = [lut[0]!, lut[1]!, lut[2]!, 255];
    expect(rgbAt(r.rgba, 400, 100, 4)).toEqual(top);
    expect(rgbAt(r.rgba, 400, 101, 4)).toEqual(top);
    expect(rgbAt(r.rgba, 400, 102, 4)).toEqual(bottom);
    expect(r.contours).toEqual([]);
  });

  it('needs a color channel', () => {
    expect(() =>
      raster2d({
        kind: 'pseudocolor-channel',
        width: 4,
        height: 4,
        x: [0.5],
        y: [0.5],
        indices: null,
        xRange: [0, 1],
        yRange: [0, 1],
        style,
        dotColor: '#000000',
      }),
    ).toThrow(/color channel/);
  });
});
