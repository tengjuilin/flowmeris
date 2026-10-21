import { type PlotSpec, type Sample, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { newPlot } from './plotFactories.ts';
import { channelTilePlots, savedPlotLike, tileChannels, variedAxis } from './tileChannels.ts';

function setup() {
  const ws: Workspace = newWorkspace('W', { version: 'test', commit: 'test', kernels: 'test' });
  const g = newGroup('G', ['s1'], ['FSC-A', 'SSC-A', 'FL1-A', 'FL2-A', 'Time']);
  g.id = 'g';
  ws.groups.push(g);
  ws.samples.s1 = {
    channels: [
      { pnn: 'FSC-A', kind: 'scatter', pnr: 1024 },
      { pnn: 'SSC-A', kind: 'scatter', pnr: 1024 },
      { pnn: 'FL1-A', kind: 'fluorescence', pnr: 1024 },
      { pnn: 'FL2-A', kind: 'fluorescence', pnr: 1024 },
      { pnn: 'Time', kind: 'time', pnr: 1024 },
    ],
    keywords: {},
  } as unknown as Sample;
  let plot!: PlotSpec;
  const next = produce(ws, (w) => {
    plot = structuredClone(newPlot(w, w.groups[0]!, 'root', 'dot', ['FSC-A', 'SSC-A']));
  });
  return { ws: next, g: next.groups[0]!, plot };
}

describe('tileChannels', () => {
  it('goes through every channel but the fixed one and the hidden ones', () => {
    const { g, plot } = setup();
    expect(tileChannels(g, plot, 'x', [])).toEqual(['SSC-A', 'FL1-A', 'FL2-A', 'Time']);
    expect(tileChannels(g, plot, 'y', ['Time'])).toEqual(['FSC-A', 'FL1-A', 'FL2-A']);
  });

  it('keeps every channel for a histogram, whose x axis varies', () => {
    const { g, plot } = setup();
    const hist: PlotSpec = { ...plot, kind: 'histogram', y: undefined };
    expect(variedAxis(hist, 'x')).toBe('x');
    expect(tileChannels(g, hist, 'x', ['FL2-A'])).toEqual(['FSC-A', 'SSC-A', 'FL1-A', 'Time']);
  });
});

describe('channelTilePlots', () => {
  it('puts the varied axis on each channel and keeps the fixed axis and the plot id', () => {
    const { ws, g, plot } = setup();
    const { plots } = channelTilePlots(ws, g, plot, 'x', ['SSC-A', 'FL1-A']);
    expect(plots.map((p) => [p.id, p.x.channel, p.y?.channel])).toEqual([
      [plot.id, 'FSC-A', 'SSC-A'],
      [plot.id, 'FSC-A', 'FL1-A'],
    ]);
    // The plot's own axis on the channel keeps its scale and range.
    expect(plots[0]!.y).toBe(plot.y);
    expect(plots[0]!.x).toBe(plot.x);
  });

  it('registers the axis defaults of channels no plot used, on a copy of the workspace', () => {
    const { ws, g, plot } = setup();
    expect(g.axisDefaults['FL2-A']).toBeUndefined();
    const built = channelTilePlots(ws, g, plot, 'x', ['FL2-A']);
    expect(ws.groups[0]!.axisDefaults['FL2-A']).toBeUndefined();
    const axis = built.ws.groups[0]!.axisDefaults['FL2-A'];
    expect(axis).toMatchObject({ channel: 'FL2-A' });
    expect(built.ws.transforms[axis!.transform]).toBeDefined();
    expect(built.plots[0]!.y).toEqual(axis);
    // Nothing more to register once it is in the workspace.
    expect(channelTilePlots(built.ws, built.ws.groups[0]!, plot, 'x', ['FL2-A']).ws).toBe(built.ws);
  });
});

describe('savedPlotLike', () => {
  it("finds the population's saved plot on the same channels", () => {
    const { g, plot } = setup();
    const other: PlotSpec = { ...plot, id: 'p2', y: { ...plot.y!, channel: 'FL1-A' } };
    const group = { ...g, plots: [plot, other] };
    expect(savedPlotLike(group, { ...plot, id: 'tile', y: { ...plot.y!, channel: 'FL1-A' } })).toBe(other);
    expect(savedPlotLike(group, { ...plot, y: { ...plot.y!, channel: 'FL2-A' } })).toBeUndefined();
  });
});
