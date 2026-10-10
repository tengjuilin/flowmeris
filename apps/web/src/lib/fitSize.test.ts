import { describe, expect, it } from 'vitest';
import { nearestColumns, rowMaxColumns, rowPlotSize, sideSpan } from './fitSize.ts';

/** Plots filling a 1000 px row with gaps of 10 px, as the Plot, Tiles and Gating path views size them. */
const sizeFor = (n: number) => (1000 - 10 * (n - 1)) / n;

describe('number of plots per row for a picked size', () => {
  it('picks the count whose size is nearest the target', () => {
    // 2 → 495, 3 → 326.7, 4 → 242.5, 5 → 192, 6 → 158.3
    expect(nearestColumns(495, sizeFor, 2, 6)).toBe(2);
    expect(nearestColumns(330, sizeFor, 2, 6)).toBe(3);
    expect(nearestColumns(250, sizeFor, 2, 6)).toBe(4);
    expect(nearestColumns(200, sizeFor, 2, 6)).toBe(5);
  });

  it('round-trips every stop of the slider', () => {
    for (let n = 2; n <= 7; n++) expect(nearestColumns(sizeFor(n), sizeFor, 2, 7)).toBe(n);
  });

  it('clamps to the range when the target is beyond either end', () => {
    expect(nearestColumns(5000, sizeFor, 2, 6)).toBe(2);
    expect(nearestColumns(10, sizeFor, 2, 6)).toBe(6);
    expect(nearestColumns(10, sizeFor, 3, 3)).toBe(3);
  });

  it('keeps the size near the pick as the width changes', () => {
    const at = (w: number) => (n: number) => (w - 10 * (n - 1)) / n;
    // A 300 px pick: 3 per row at 1000 px, 2 at 600 px, 6 at 1900 px.
    expect(nearestColumns(300, at(1000), 2, 7)).toBe(3);
    expect(nearestColumns(300, at(600), 2, 7)).toBe(2);
    expect(nearestColumns(300, at(1900), 2, 7)).toBe(6);
  });

  it('prefers fewer plots per row on an exact tie', () => {
    const tie = (n: number) => [0, 0, 300, 200][n]!;
    expect(nearestColumns(250, tie, 2, 3)).toBe(2);
  });
});

describe('a row of plots filling a width', () => {
  // Tiles: 12 px apart, 10 px of padding and border each.
  const tiles = { gap: 12, pad: 10, minSize: 160, minColumns: 2, maxColumns: 12 };
  // Plot grid: 8 px apart, no padding.
  const grid = { gap: 8, pad: 0, minSize: 160, minColumns: 2, maxColumns: 12 };

  it('sizes plots so the row, gaps included, fills the width', () => {
    // 3 tiles of 315 + 10 px with 2 gaps of 12 px: 999 px.
    expect(rowPlotSize(1000, 3, tiles)).toBe(315);
    expect(3 * (315 + 10) + 2 * 12).toBeLessThanOrEqual(1000);
    expect(4 * (315 + 10) + 3 * 12).toBeGreaterThan(1000);
    expect(rowPlotSize(1000, 4, grid)).toBe(Math.floor((1000 - 8 * 3) / 4));
  });

  it('matches the grid’s own formula at every width and count', () => {
    for (const w of [333, 640.5, 999, 1280])
      for (let n = 2; n <= 12; n++) expect(rowPlotSize(w, n, grid)).toBe(Math.floor((w - 8 * (n - 1)) / n));
  });

  it('allows as many columns as plots of the minimum size fit, within the limits', () => {
    expect(rowMaxColumns(1000, tiles)).toBe(5); // (1000 + 12) / 182 = 5.6
    expect(rowMaxColumns(1000, grid)).toBe(6); // (1000 + 8) / 168 = 6
    expect(rowMaxColumns(100, tiles)).toBe(2);
    expect(rowMaxColumns(10000, grid)).toBe(12);
  });

  it('spans the side card over the columns it needs, at most all of them', () => {
    expect(sideSpan(280, 300, 4, grid)).toBe(1);
    expect(sideSpan(320, 300, 4, grid)).toBe(2);
    expect(sideSpan(280, 150, 4, tiles)).toBe(2); // (280 + 12) / 172 = 1.7
    expect(sideSpan(2000, 150, 4, tiles)).toBe(4);
  });
});
