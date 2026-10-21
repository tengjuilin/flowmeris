import type { PlotSpec, Workspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FIGURE } from './figure.ts';
import { axisLabel, colorBarLayout, colorBarSpan, plotAriaLabel, plotBox } from './plotLayout.ts';

const plot = (figure: Partial<typeof DEFAULT_FIGURE> = {}, kind = 'dot'): PlotSpec =>
  ({
    kind,
    population: 'root',
    x: { channel: 'FL1-A', comp: 'group', transform: 't', range: [0, 1] },
    y: { channel: 'FL2-A', comp: 'group', transform: 't', range: [0, 1] },
    style: { figure: { ...DEFAULT_FIGURE, ...figure } },
  }) as unknown as PlotSpec;

/** A Pseudocolor channel plot colored by FL3-A. */
const colored = (figure: Partial<typeof DEFAULT_FIGURE> = {}): PlotSpec => ({
  ...plot(figure, 'pseudocolor-channel'),
  color: { channel: 'FL3-A', comp: 'group', transform: 't', range: [0, 1], stat: 'median' },
});

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

  it('describe the plot for screen readers', () => {
    expect(plotAriaLabel(ws, 's', plot())).toBe('dot plot of CD4 :: FL1-A versus FL2-A');
    expect(plotAriaLabel(ws, 's', plot({}, 'histogram'))).toBe('histogram plot of CD4 :: FL1-A');
    expect(plotAriaLabel(ws, 's', plot({}, 'pseudocolor'))).toBe(
      'pseudocolor density plot of CD4 :: FL1-A versus FL2-A',
    );
    expect(plotAriaLabel(ws, 's', colored())).toBe(
      'pseudocolor channel plot of CD4 :: FL1-A versus FL2-A, colored by FL3-A',
    );
  });

  it('names the color axis by its channel, or its custom title', () => {
    expect(axisLabel(ws, 's', colored(), 'color')).toBe('FL3-A');
    expect(axisLabel(ws, 's', colored({ colorTitle: 'IL-2' }), 'color')).toBe('IL-2');
  });
});

describe('color bar', () => {
  it('widens the right margin of a Pseudocolor channel plot only, while shown', () => {
    const r = (p: PlotSpec) => plotBox(p, 400, 300).margin.r;
    expect(r(colored())).toBeGreaterThan(r(plot()));
    expect(r(colored({ colorBar: false }))).toBe(r(plot()));
    expect(r({ ...colored(), kind: 'pseudocolor' })).toBe(r(plot()));
    expect(plotBox(colored(), 400, 300, true).margin.r).toBe(4);
  });

  it('places the title right of the tick labels, nearer without them', () => {
    const on = colorBarLayout(colored())!;
    const off = colorBarLayout(colored({ showTickLabels: false }))!;
    expect(on.titleX).toBeGreaterThan(on.labelX);
    expect(off.titleX).toBeLessThan(on.titleX);
    expect(on.width).toBeGreaterThan(on.titleX);
  });

  it('is as wide as set, and as long as set (% of the plot height, centered)', () => {
    const wide = colorBarLayout(colored({ colorBarWidth: 30 }))!;
    const base = colorBarLayout(colored())!;
    expect(wide.barWidth).toBe(30);
    expect(wide.labelX - base.labelX).toBe(18);
    expect(colorBarSpan({ ...DEFAULT_FIGURE, colorBarLength: 50 }, 200)).toEqual({ top: 50, height: 100 });
    expect(colorBarSpan(DEFAULT_FIGURE, 200)).toEqual({ top: 0, height: 200 });
  });
});
