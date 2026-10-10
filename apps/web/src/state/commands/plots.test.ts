import { type Sample, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_INFO, useStore } from '../store.ts';
import { createGate } from './gates.ts';
import { drill, editPlot, ensurePlot } from './plots.ts';

const S = useStore.getState;
const g = () => S().ws.groups[0]!;

beforeEach(() => {
  const ws: Workspace = newWorkspace('t', APP_INFO);
  const grp = newGroup('G', ['a'], ['FSC-A', 'SSC-A', 'FL1-A', 'FL2-A']);
  grp.id = 'g';
  ws.groups.push(grp);
  ws.samples.a = {
    channels: ['FSC-A', 'SSC-A', 'FL1-A', 'FL2-A'].map((pnn) => ({ pnn, kind: 'scatter', pnr: 1024 })),
    keywords: {},
  } as unknown as Sample;
  S().setWorkspace(ws);
});

describe('plot commands', () => {
  it('make a population’s plot on its parent plot’s channels, once', () => {
    S().setUi({ groupId: 'g' });
    const parent = ensurePlot('root');
    editPlot('g', parent, 'axes', (p) => {
      p.x = { ...p.x, channel: 'FL1-A' };
      p.y = { ...p.y!, channel: 'FL2-A' };
    });
    const pop = createGate('g', {
      parentPop: 'root',
      dims: [
        { channel: 'FL1-A', comp: 'group', transform: null },
        { channel: 'FL2-A', comp: 'group', transform: null },
      ],
      geometry: { kind: 'rect', min: [0, 0], max: [1, 1] },
    });
    const id = ensurePlot(pop);
    expect(ensurePlot(pop)).toBe(id);
    const plot = g().plots.find((p) => p.id === id)!;
    expect([plot.population, plot.x.channel, plot.y?.channel]).toEqual([pop, 'FL1-A', 'FL2-A']);
  });

  it('drill into a population: select it and its plot', () => {
    S().setUi({ groupId: 'g', selectedGateId: 'x' });
    drill('root');
    expect(S().ui).toMatchObject({ popId: 'root', plotId: g().plots[0]!.id, selectedGateId: null });
  });
});
