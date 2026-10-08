import type { Group, PlotSpec } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from './defaults.ts';
import { DEFAULT_FIGURE, newPlotStyle, resetPairStyles, syncPlotStyles, withAxesChange } from './figure.ts';

const plot = (id: string, style = structuredClone(DEFAULT_STYLE)): PlotSpec =>
  ({ id, population: 'root', kind: 'pseudocolor', x: {}, style }) as unknown as PlotSpec;

describe('shared plot settings', () => {
  it('copies shared settings to the other plots and keeps their own title, ticks and axis titles', () => {
    const a = plot('a');
    a.style.pointPx = 3;
    a.style.figure = { ...structuredClone(DEFAULT_FIGURE), fontSize: 14, title: 'A', xTitle: 'X of A' };
    const b = plot('b');
    b.style.figure = { ...structuredClone(DEFAULT_FIGURE), title: 'B', yTicks: [{ value: 10 }] };
    const g = { plotStyleFollow: true, plots: [a, b] } as unknown as Group;
    syncPlotStyles(g, 'a');
    expect(b.style.pointPx).toBe(3);
    expect(b.style.figure?.fontSize).toBe(14);
    expect(b.style.figure?.title).toBe('B');
    expect(b.style.figure?.xTitle).toBeUndefined();
    expect(b.style.figure?.yTicks).toEqual([{ value: 10 }]);
  });

  it('leaves the other plots alone while off', () => {
    const a = plot('a');
    a.style.pointPx = 3;
    const b = plot('b');
    syncPlotStyles({ plotStyleFollow: false, plots: [a, b] } as unknown as Group, 'a');
    expect(b.style.pointPx).toBe(DEFAULT_STYLE.pointPx);
  });

  it('gives a new plot the shared settings without the first plot’s title', () => {
    const a = plot('a');
    a.style.colormap = 'magma';
    a.style.figure = { ...structuredClone(DEFAULT_FIGURE), title: 'A' };
    const s = newPlotStyle({ plotStyleFollow: true, plots: [a] } as unknown as Group, DEFAULT_STYLE);
    expect(s.colormap).toBe('magma');
    expect(s.figure?.title).toBeUndefined();
  });
});

describe('settings per channel pair', () => {
  const xy = (x: string, y: string) => {
    const p = plot('p');
    p.x = { channel: x } as PlotSpec['x'];
    p.y = { channel: y } as PlotSpec['x'];
    return p;
  };

  it('keeps one set of settings while following', () => {
    const p = xy('A', 'B');
    p.style.pointPx = 3;
    expect(withAxesChange(p, () => void (p.x = { channel: 'C' } as PlotSpec['x']))).toBe(false);
    expect(p.style.pointPx).toBe(3);
    expect(p.stylesByAxes).toBeUndefined();
  });

  it('saves the old pair and restores a pair seen before', () => {
    const p = xy('A', 'B');
    p.styleFollow = false;
    p.style.pointPx = 3;
    withAxesChange(p, () => void (p.x = { channel: 'C' } as PlotSpec['x']));
    expect(p.style.pointPx).toBe(3); // a new pair starts from the current settings
    p.style.pointPx = 5;
    expect(withAxesChange(p, () => void (p.x = { channel: 'A' } as PlotSpec['x']))).toBe(true);
    expect(p.style.pointPx).toBe(3);
    withAxesChange(p, () => void (p.x = { channel: 'C' } as PlotSpec['x']));
    expect(p.style.pointPx).toBe(5);
  });
});

describe('resetting one channel pair', () => {
  it('resets the pair where it is shown or saved, and leaves other pairs', () => {
    const a = plot('a');
    a.x = { channel: 'A' } as PlotSpec['x'];
    a.y = { channel: 'B' } as PlotSpec['x'];
    a.style.pointPx = 3;
    const b = plot('b');
    b.x = { channel: 'C' } as PlotSpec['x'];
    b.y = { channel: 'D' } as PlotSpec['x'];
    b.style.pointPx = 4;
    b.stylesByAxes = { 'A|B': { ...structuredClone(DEFAULT_STYLE), pointPx: 5 } };
    resetPairStyles({ plots: [a, b] } as unknown as Group, 'A|B', DEFAULT_STYLE);
    expect(a.style.pointPx).toBe(DEFAULT_STYLE.pointPx);
    expect(b.style.pointPx).toBe(4);
    expect(b.stylesByAxes['A|B']).toBeUndefined();
  });
});
