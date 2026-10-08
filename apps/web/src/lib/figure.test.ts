import type { Group, PlotSpec } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from './defaults.ts';
import { DEFAULT_FIGURE, newPlotStyle, syncPlotStyles } from './figure.ts';

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
