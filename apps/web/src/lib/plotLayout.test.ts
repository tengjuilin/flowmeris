import type { PlotSpec, Workspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FIGURE } from './figure.ts';
import { axisLabel, plotBox } from './plotLayout.ts';

const plot = (figure: Partial<typeof DEFAULT_FIGURE> = {}, kind = 'dot'): PlotSpec =>
  ({
    kind,
    population: 'root',
    x: { channel: 'FL1-A', comp: 'group', transform: 't', range: [0, 1] },
    y: { channel: 'FL2-A', comp: 'group', transform: 't', range: [0, 1] },
    style: { figure: { ...DEFAULT_FIGURE, ...figure } },
  }) as unknown as PlotSpec;

describe('plotBox', () => {
  it('without a box aspect ratio, fills the space given, less the margins', () => {
    const b = plotBox(plot({ boxAspect: undefined }), 400, 300);
    expect(b.width).toBe(400);
    expect(b.height).toBe(300);
    expect(b.pw).toBe(400 - b.margin.l - b.margin.r);
    expect(b.ph).toBe(300 - b.margin.t - b.margin.b);
  });

  it('uses small fixed margins when compact', () => {
    expect(plotBox(plot(), 100, 100, true).margin).toEqual({ l: 6, r: 4, t: 4, b: 6 });
  });

  it('leaves room for a title', () => {
    expect(plotBox(plot({ title: 'A' }), 400, 300).margin.t).toBeGreaterThan(
      plotBox(plot(), 400, 300).margin.t,
    );
  });

  it('shrinks to the largest box of a fixed aspect ratio', () => {
    const b = plotBox(plot({ boxAspect: 1 }), 600, 300);
    expect(b.pw).toBe(b.ph);
    expect(b.height).toBe(300);
    expect(b.width).toBe(b.pw + b.margin.l + b.margin.r);
  });
});

describe('axisLabel', () => {
  const ws = {
    samples: { s: { channels: [{ pnn: 'FL1-A', pns: 'CD4' }, { pnn: 'FL2-A' }] } },
  } as unknown as Workspace;

  it('names the channel by its marker when it has one', () => {
    expect(axisLabel(ws, 's', plot(), 'x')).toBe('CD4 :: FL1-A');
    expect(axisLabel(ws, 's', plot(), 'y')).toBe('FL2-A');
    expect(axisLabel(ws, 'missing', plot(), 'x')).toBe('FL1-A');
  });

  it('uses a custom title, but only the x one on a histogram', () => {
    const p = plot({ xTitle: ' Size ', yTitle: 'Granularity' });
    expect(axisLabel(ws, 's', p, 'x')).toBe('Size');
    expect(axisLabel(ws, 's', p, 'y')).toBe('Granularity');
    expect(axisLabel(ws, 's', { ...p, kind: 'histogram' }, 'y')).toBe('FL2-A');
  });
});
