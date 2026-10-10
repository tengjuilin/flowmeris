import { type PlotSpec, type Sample, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { beforeEach, describe, expect, it } from 'vitest';
import { UNSAVED_PLOT_ID, gateViewPlot } from '../../lib/unsavedPlot.ts';
import { APP_INFO, useStore } from '../store.ts';
import { createGate, renamePopulation } from './gates.ts';
import { drill, editPlot, openPathPlot, setAxisChannel } from './plots.ts';

const S = useStore.getState;
const g = () => S().ws.groups[0]!;
/** The plot the Gate view shows. */
const shown = () => gateViewPlot(S().ws, g(), S().ui)!.plot;

const rectGate = (parentPop: string) => ({
  parentPop,
  dims: [
    { channel: 'FL1-A', comp: 'group' as const, transform: null },
    { channel: 'FL2-A', comp: 'group' as const, transform: null },
  ],
  geometry: { kind: 'rect' as const, min: [0, 0], max: [1, 1] },
});

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
  S().setUi({ groupId: 'g', view: 'gate' });
});

describe('the Gate view’s unsaved plot', () => {
  it('opening a population without a plot changes nothing in the workspace', () => {
    const ws = S().ws;
    S().setUi({ selectedGateId: 'x' });
    drill('root');
    expect(S().ui).toMatchObject({ popId: 'root', plotId: null, selectedGateId: null });
    expect(S().ws).toBe(ws);
    expect(S().past).toEqual([]);
    expect(shown().id).toBe(UNSAVED_PLOT_ID);
  });

  it('the first edit saves it in the same undo step, and undo makes it unsaved again', () => {
    const ws = S().ws;
    drill('root');
    setAxisChannel((label, fn) => editPlot('g', shown().id, label, fn), 'x', 'FL1-A');
    expect(S().past.map((h) => h.label)).toEqual(['Add plot and change axis channel']);
    expect(g().plots).toHaveLength(1);
    const saved = g().plots[0]!;
    expect(saved.id).not.toBe(UNSAVED_PLOT_ID);
    expect(saved.x.channel).toBe('FL1-A');
    expect(S().ui.plotId).toBe(saved.id);
    expect(shown()).toBe(saved);

    S().undo();
    expect(S().ws.groups).toEqual(ws.groups);
    expect(shown().id).toBe(UNSAVED_PLOT_ID);
  });

  it('drawing a gate on it saves it; a later edit is a step of its own', () => {
    drill('root');
    createGate('g', rectGate('root'));
    expect(S().past.map((h) => h.label)).toEqual(['Add plot and add gate']);
    expect(g().plots.map((p) => p.population)).toEqual(['root']);
    editPlot('g', shown().id, 'Change style', (p) => {
      p.style.pointPx = 7;
    });
    expect(S().past.map((h) => h.label)).toEqual(['Add plot and add gate', 'Change style']);
    expect(g().plots).toHaveLength(1);
  });

  it('a population’s plot takes its parent plot’s channels', () => {
    drill('root');
    editPlot('g', shown().id, 'axes', (p) => {
      p.x = { ...p.x, channel: 'FL1-A' };
      p.y = { ...p.y!, channel: 'FL2-A' };
    });
    const pop = createGate('g', rectGate('root'));
    drill(pop);
    expect([shown().id, shown().population, shown().x.channel, shown().y?.channel]).toEqual([
      UNSAVED_PLOT_ID,
      pop,
      'FL1-A',
      'FL2-A',
    ]);
  });

  it('edits that do not change it leave it unsaved', () => {
    drill('root');
    renamePopulation('g', 'root', 'Everything');
    expect(S().past.map((h) => h.label)).toEqual(['Rename population']);
    expect(g().plots).toEqual([]);
    editPlot('g', shown().id, 'Nothing', () => {});
    expect(S().past).toHaveLength(1);
  });

  it('only the Gate view saves it', () => {
    drill('root');
    S().setUi({ view: 'tiles' });
    createGate('g', rectGate('root'));
    expect(g().plots).toEqual([]);
  });

  it('edits merged into the saving step keep its label', () => {
    drill('root');
    const style = (n: number) =>
      S().mutate(
        'Change point size',
        (w) => {
          const p = w.groups[0]!.plots.find((x) => x.id === shown().id);
          if (p) p.style.pointPx = n;
        },
        'size',
      );
    style(2);
    style(3);
    expect(S().past.map((h) => h.label)).toEqual(['Add plot and change point size']);
    expect(g().plots[0]!.style.pointPx).toBe(3);
  });

  it('a Gating path plot opens unsaved, and is saved with its axes on the first edit', () => {
    drill('root');
    createGate('g', rectGate('root'));
    const ws = S().ws;
    const preview = { ...structuredClone(g().plots[0]!), id: 'path_x' } as PlotSpec;
    preview.x = { ...preview.x, channel: 'FL2-A' };
    openPathPlot('root', preview, false);
    expect(S().ws).toBe(ws);
    expect(S().ui.view).toBe('gate');
    expect([shown().id, shown().x.channel]).toEqual([UNSAVED_PLOT_ID, 'FL2-A']);
    editPlot('g', shown().id, 'Change style', (p) => {
      p.style.pointPx = 4;
    });
    expect(g().plots.map((p) => [p.x.channel, p.style.pointPx === 4])).toEqual([
      [g().plots[0]!.x.channel, false],
      ['FL2-A', true],
    ]);
  });

  it('opening another population drops the unsaved Gating path plot', () => {
    drill('root');
    const preview = { ...shown(), id: 'path_x' } as PlotSpec;
    openPathPlot('root', preview, false);
    const pop = createGate('g', rectGate('root'));
    S().setUi({ popId: pop });
    expect(S().ui.unsavedPlot).toBeNull();
  });
});
