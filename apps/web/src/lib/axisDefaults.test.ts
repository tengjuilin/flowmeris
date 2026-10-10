import { type Sample, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import {
  axisAtFactory,
  defaultAxis,
  defaultChannels,
  factoryAxis,
  registerTransform,
  resetAxisToFactory,
  scaleKindOf,
  transformOfKind,
} from './axisDefaults.ts';
import { newPlot, newTilePlot } from './plotFactories.ts';

function setup(channels: Partial<Sample['channels'][number]>[], keywords: Record<string, string> = {}) {
  const ws: Workspace = newWorkspace('W', { version: 'test', commit: 'test', kernels: 'test' });
  const g = newGroup(
    'G',
    ['s1'],
    channels.map((c) => c.pnn!),
  );
  ws.groups.push(g);
  ws.samples.s1 = { channels, keywords } as unknown as Sample;
  return { ws, g };
}

const CHANNELS = [
  { pnn: 'Time', kind: 'time' as const, pnr: 1000, dataMax: 42 },
  { pnn: 'FSC-H', kind: 'scatter' as const, pnr: 262144 },
  { pnn: 'FSC-A', kind: 'scatter' as const, pnr: 262144 },
  { pnn: 'SSC-A', kind: 'scatter' as const, pnr: 262144 },
  { pnn: 'FL1-A', kind: 'fluor' as const, pnr: 512 },
];

describe('default axes', () => {
  it('are linear for scatter, logicle (T ≥ 1024) for fluorescence, linear to the data for time', () => {
    const { ws, g } = setup(CHANNELS);
    const t = (ch: string) => ws.transforms[factoryAxis(ws, g, ch).transform];
    expect(t('FSC-A')).toEqual({ kind: 'flin', T: 262144, A: 0 });
    expect(t('FL1-A')).toEqual({ kind: 'logicle', T: 1024, W: 0.5, M: 4.5, A: 0 });
    expect(t('Time')).toEqual({ kind: 'flin', T: 42, A: 0 });
    expect(factoryAxis(ws, g, 'FSC-A').range).toEqual([0, 1]);
  });

  it('save the built-in axis as the group default, then keep the user’s choice', () => {
    const { ws, g } = setup(CHANNELS);
    const a = defaultAxis(ws, g, 'FL1-A');
    expect(g.axisDefaults['FL1-A']).toEqual(a);
    g.axisDefaults['FL1-A'] = { ...a, range: [0.1, 0.9] };
    expect(defaultAxis(ws, g, 'FL1-A').range).toEqual([0.1, 0.9]);
  });

  it('pick FSC-A and SSC-A first, skipping time channels', () => {
    const first = setup(CHANNELS);
    expect(defaultChannels(first.ws, first.g)).toEqual(['FSC-A', 'SSC-A']);
    const { ws, g } = setup([CHANNELS[0]!, { pnn: 'B1' }, { pnn: 'B2' }]);
    expect(defaultChannels(ws, g)).toEqual(['B1', 'B2']);
  });

  it('offer each scale kind with the given top of scale', () => {
    expect(transformOfKind('linear', 1000)).toEqual({ kind: 'flin', T: 1000, A: 0 });
    expect(transformOfKind('log', 1e5)).toEqual({ kind: 'flog', T: 1e5, M: 5 });
    expect(transformOfKind('logicle', 1000)).toEqual({ kind: 'logicle', T: 1000, W: 0.5, M: 4.5, A: 0 });
    for (const k of ['linear', 'log', 'logicle', 'arcsinh'] as const)
      expect(scaleKindOf(transformOfKind(k, 1000))).toBe(k);
  });
});

describe('new plots', () => {
  it('use the default channels and leave out y for a histogram', () => {
    const { ws, g } = setup(CHANNELS);
    const p = newPlot(ws, g, 'root');
    expect([p.x.channel, p.y?.channel]).toEqual(['FSC-A', 'SSC-A']);
    expect(newPlot(ws, g, 'root', 'histogram', ['FL1-A', 'FL1-A']).y).toBeUndefined();
    expect(g.plots).toHaveLength(2);
  });

  it('copy the Gate view plot’s kind and axes into a new Tiles plot', () => {
    const { ws, g } = setup(CHANNELS);
    newPlot(ws, g, 'root', 'dot', ['FL1-A', 'SSC-A']);
    const t = newTilePlot(ws, g, 'root');
    expect([t.kind, t.x.channel, t.y?.channel]).toEqual(['dot', 'FL1-A', 'SSC-A']);
    expect(t.style.figure?.fontSize).toBe(11);
  });
});

describe('factory axes', () => {
  it('tell an axis at its built-in scale and range, and put one back there', () => {
    const { ws, g } = setup(CHANNELS);
    const a = { ...factoryAxis(ws, g, 'FL1-A') };
    expect(axisAtFactory(ws, g, a)).toBe(true);
    a.range = [0.1, 1];
    a.transform = registerTransform(ws, transformOfKind('linear', 512));
    expect(axisAtFactory(ws, g, a)).toBe(false);
    resetAxisToFactory(ws, g, a);
    expect(a).toEqual(factoryAxis(ws, g, 'FL1-A'));
  });
});
