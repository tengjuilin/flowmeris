import type { Group, PlotSpec } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from './defaults.ts';
import {
  DEFAULT_FIGURE,
  PANEL_FIGURE_KEYS,
  applyToPairs,
  applyToPopulations,
  carryToPopulation,
  isDefaultStyle,
  pairAtDefaults,
  pairsMatch,
  plotAtDefaults,
  populationsMatch,
  resetCurrentStyle,
  resetPairStyles,
  resetStyleKeys,
  setPairStyles,
  styleKeysAtDefaults,
  withAxesChange,
} from './figure.ts';

const plot = (id: string, x = 'A', y = 'B'): PlotSpec =>
  ({
    id,
    population: id,
    kind: 'pseudocolor',
    x: { channel: x },
    y: { channel: y },
    style: structuredClone(DEFAULT_STYLE),
  }) as unknown as PlotSpec;
const fig = (o: Partial<typeof DEFAULT_FIGURE>) => ({ ...structuredClone(DEFAULT_FIGURE), ...o });
const setX = (p: PlotSpec, x: string) =>
  withAxesChange(p, () => void (p.x = { channel: x } as PlotSpec['x']));

describe('applying settings across populations', () => {
  it('copies the shared settings now and keeps each plot’s title, ticks and axis titles', () => {
    const a = plot('a');
    a.style.pointPx = 3;
    a.style.figure = fig({ fontSize: 20, title: 'A', xTitle: 'X of A' });
    const b = plot('b');
    b.style.figure = fig({ title: 'B', yTicks: [{ value: 10 }] });
    const g = { plots: [a, b] } as unknown as Group;
    expect(populationsMatch(g, 'a')).toBe(false);
    applyToPopulations(g, 'a');
    expect(b.style.pointPx).toBe(3);
    expect(b.style.figure?.fontSize).toBe(20);
    expect(b.style.figure?.title).toBe('B');
    expect(b.style.figure?.xTitle).toBeUndefined();
    expect(b.style.figure?.yTicks).toEqual([{ value: 10 }]);
    expect(populationsMatch(g, 'a')).toBe(true);
  });

  it('carries the settings of the population left to the one opened', () => {
    const a = plot('a');
    a.style.colormap = 'magma';
    a.style.figure = fig({ title: 'A' });
    const b = plot('b');
    expect(carryToPopulation(a, b)).toBe(true);
    expect(b.style.colormap).toBe('magma');
    expect(b.style.figure?.title).toBeUndefined();
    expect(carryToPopulation(a, b)).toBe(false); // already the same
  });
});

describe('settings per channel pair', () => {
  it('carries the settings in use to the next pair while carrying is on, and saves the pair left', () => {
    const p = plot('p');
    p.style.pointPx = 3;
    expect(setX(p, 'C')).toBe(false);
    expect(p.style.pointPx).toBe(3);
    expect(p.stylesByAxes?.['A|B']?.pointPx).toBe(3);
  });

  it('restores each pair’s own settings while carrying is off', () => {
    const p = plot('p');
    p.style.pointPx = 3;
    setPairStyles(p, true);
    setX(p, 'C');
    expect(p.style.pointPx).toBe(3); // a pair not used yet starts from the settings when it was turned off
    p.style.pointPx = 5;
    expect(setX(p, 'A')).toBe(true);
    expect(p.style.pointPx).toBe(3);
    setX(p, 'C');
    expect(p.style.pointPx).toBe(5);
  });

  it('does not change anything when carrying is switched', () => {
    const p = plot('p');
    p.style.pointPx = 3;
    p.stylesByAxes = { 'C|B': { ...structuredClone(DEFAULT_STYLE), pointPx: 7 } };
    setPairStyles(p, true);
    setPairStyles(p, false);
    expect(p.style.pointPx).toBe(3);
    expect(p.stylesByAxes['C|B']?.pointPx).toBe(7);
  });

  it('applies the settings in use to every pair now', () => {
    const p = plot('p');
    setPairStyles(p, true);
    p.style.pointPx = 3;
    setX(p, 'C');
    p.style.pointPx = 5;
    expect(pairsMatch(p)).toBe(false);
    applyToPairs(p);
    expect(pairsMatch(p)).toBe(true);
    setX(p, 'A');
    expect(p.style.pointPx).toBe(5);
  });
});

describe('resetting', () => {
  it('resets only the current plot', () => {
    const p = plot('p');
    p.style.pointPx = 3;
    setX(p, 'C');
    resetCurrentStyle(p, DEFAULT_STYLE);
    expect(isDefaultStyle(p.style, DEFAULT_STYLE)).toBe(true);
    expect(plotAtDefaults(p, DEFAULT_STYLE)).toBe(false); // the A|B pair keeps 3 px
  });

  it('resets one channel pair where it is shown or saved, and leaves other pairs', () => {
    const a = plot('a');
    a.style.pointPx = 3;
    const b = plot('b', 'C', 'D');
    b.style.pointPx = 4;
    setPairStyles(b, true);
    b.stylesByAxes = { 'A|B': { ...structuredClone(DEFAULT_STYLE), pointPx: 5 } };
    const g = { plots: [a, b] } as unknown as Group;
    resetPairStyles(g, 'A|B', DEFAULT_STYLE);
    expect(a.style.pointPx).toBe(DEFAULT_STYLE.pointPx);
    expect(b.style.pointPx).toBe(4);
    expect(b.stylesByAxes['A|B']?.pointPx).toBe(DEFAULT_STYLE.pointPx);
    expect(pairAtDefaults(g, 'A|B', DEFAULT_STYLE)).toBe(true);
    expect(pairAtDefaults(g, 'X|Y', DEFAULT_STYLE)).toBe(false); // b's unused pairs start at 4 px
  });

  it('resets one panel’s settings and leaves the others', () => {
    const p = plot('p');
    p.style.pointPx = 3;
    p.style.figure = fig({
      fontSize: 20,
      tickWidth: 2,
      gateText: { bold: false, italic: true, underline: false },
    });
    resetStyleKeys(p.style, PANEL_FIGURE_KEYS.axis, null);
    expect(p.style.figure?.tickWidth).toBe(DEFAULT_FIGURE.tickWidth);
    expect(p.style.figure?.fontSize).toBe(20);
    expect(styleKeysAtDefaults(p.style, PANEL_FIGURE_KEYS.text, null)).toBe(false);
    resetStyleKeys(p.style, PANEL_FIGURE_KEYS.figure, DEFAULT_STYLE);
    expect(p.style.pointPx).toBe(DEFAULT_STYLE.pointPx);
    expect(p.style.figure?.fontSize).toBe(DEFAULT_FIGURE.fontSize);
    expect(p.style.figure?.gateText.italic).toBe(true);
    expect(styleKeysAtDefaults(p.style, PANEL_FIGURE_KEYS.figure, DEFAULT_STYLE)).toBe(true);
  });
});
