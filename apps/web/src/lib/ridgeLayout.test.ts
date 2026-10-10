import type { RidgeCurve } from '@flowmeris/density';
import { describe, expect, it } from 'vitest';
import { ridgeFrame, ridgeLabels, ridgePaths } from './ridgeLayout.ts';
import { DEFAULT_RIDGE_STYLE } from './ridgeStyle.ts';

const curve = (events: number, band = false): RidgeCurve => ({
  centers: new Float64Array([0, 1, 2]),
  heights: new Float64Array([0, 1, 0.5]),
  ...(band ? { band: { lo: new Float64Array([0, 0.8, 0.4]), hi: new Float64Array([0, 1, 0.6]) } } : {}),
  events,
  n: 1,
});
const rows = [
  { id: 's1', label: 'A', sampleIds: ['s1'] },
  { id: 'c', label: 'B', sampleIds: ['s2', 's3'] },
];

describe('ridge labels', () => {
  it('adds event counts, with the number of replicates of a combined ridge', () => {
    const style = { ...DEFAULT_RIDGE_STYLE, showCounts: true, countOnNewLine: false };
    const ls = ridgeLabels(rows, { s1: curve(1234), c: curve(50) }, {}, style, false);
    expect(ls).toEqual([
      { name: `A (n=${(1234).toLocaleString()})`, count: '' },
      { name: 'B (2×, n=50)', count: '' },
    ]);
  });

  it('puts the count on its own line, says missing, and uses custom names', () => {
    const style = {
      ...DEFAULT_RIDGE_STYLE,
      showCounts: true,
      countOnNewLine: true,
      sampleLabels: { c: 'Mine' },
    };
    const ls = ridgeLabels(rows, { s1: null, c: null }, { s2: true, s3: true }, style, true);
    expect(ls).toEqual([
      { name: 'A', count: '' },
      { name: 'Mine', count: '(missing)' },
    ]);
  });
});

describe('ridge plot layout', () => {
  const labels = [
    { name: 'A', count: '' },
    { name: 'B', count: '' },
  ];
  const measure = (s: string) => s.length * 6;

  it('fits the view width, with the label column and axis below the last ridge', () => {
    const style = { ...DEFAULT_RIDGE_STYLE, labelOverflow: 'wrap' as const, rowHeight: 40, labelWidth: 100 };
    const f = ridgeFrame(style, 0.5, labels, measure, 1024, 'FSC-A');
    expect(f.W).toBe(1000);
    expect(f.labelW).toBe(100);
    expect(f.pw).toBe(880);
    expect(f.amp).toBe(80);
    expect(f.axisY).toBe(f.top + f.rowH + 6);
    expect(f.H).toBeGreaterThan(f.axisY);
  });

  it('widens the label column to the longest label', () => {
    const style = { ...DEFAULT_RIDGE_STYLE, labelOverflow: 'widen' as const };
    const f = ridgeFrame(style, 0.5, [{ name: 'abcdefghij', count: '' }], measure, 800, '');
    expect(f.labelW).toBe(60 + 16);
    expect(f.labelLines).toEqual([['abcdefghij']]);
  });

  it('derives the row height from a fixed aspect ratio', () => {
    const style = { ...DEFAULT_RIDGE_STYLE, width: 600, aspect: 2 };
    const f = ridgeFrame(style, 0.6, labels, measure, 0, 'T');
    expect(f.H).toBeCloseTo(300 - 26 + 20 + 6, 6);
  });
});

describe('ridge paths', () => {
  it('closes the curve on the baseline and draws the band out along hi and back along lo', () => {
    const X = (v: number) => v * 10;
    const { curve: d, band } = ridgePaths(curve(1, true), X, 100, 50);
    expect(d).toBe('M0,100L0,100L10,50L20,75L20,100Z');
    expect(band).toBe('M0,100L10,50L20,70L20,80L10,60L0,100Z');
    expect(ridgePaths(curve(1), X, 100, 50).band).toBe('');
  });
});
