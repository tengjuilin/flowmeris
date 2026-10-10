import { type Sample, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { enablePatches, produce, produceWithPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import { addGate } from './gates.ts';
import { newPlot } from './plotFactories.ts';
import { UNSAVED_PLOT_ID, addUnsaved, gateViewPlot, settleUnsaved } from './unsavedPlot.ts';

function setup() {
  const ws: Workspace = newWorkspace('W', { version: 'test', commit: 'test', kernels: 'test' });
  const g = newGroup('G', ['s1'], ['FSC-A', 'SSC-A', 'FL1-A']);
  g.id = 'g';
  ws.groups.push(g);
  ws.samples.s1 = {
    channels: [
      { pnn: 'FSC-A', kind: 'scatter', pnr: 1024 },
      { pnn: 'SSC-A', kind: 'scatter', pnr: 1024 },
      { pnn: 'FL1-A', kind: 'fluorescence', pnr: 1024 },
    ],
    keywords: {},
  } as unknown as Sample;
  return { ws, g };
}

const rect = (parentPop: string) => ({
  parentPop,
  dims: [
    { channel: 'FSC-A', comp: 'group' as const, transform: null },
    { channel: 'SSC-A', comp: 'group' as const, transform: null },
  ],
  geometry: { kind: 'rect' as const, min: [0, 0], max: [1, 1] },
});

enablePatches();

const sel = (popId: string, plotId: string | null = null) => ({ popId, plotId, unsavedPlot: null });

describe('gateViewPlot', () => {
  it('picks the selected saved plot, else the first, else an unsaved one', () => {
    const { ws, g } = setup();
    expect(gateViewPlot(ws, g, sel('root'))).toMatchObject({ saved: false, plot: { id: UNSAVED_PLOT_ID } });
    const a = newPlot(ws, g, 'root');
    const b = newPlot(ws, g, 'root');
    expect(gateViewPlot(ws, g, sel('root'))?.plot).toBe(a);
    expect(gateViewPlot(ws, g, sel('root', b.id))?.plot).toBe(b);
    expect(gateViewPlot(ws, g, sel('nope'))).toBeUndefined();
  });

  it('shows the unsaved plot set for the population when it is picked or there is no saved plot', () => {
    const { ws, g } = setup();
    const unsavedPlot = { ...structuredClone(newPlot(ws, g, 'root')), id: UNSAVED_PLOT_ID };
    expect(gateViewPlot(ws, g, { popId: 'root', plotId: null, unsavedPlot })?.saved).toBe(true);
    expect(gateViewPlot(ws, g, { popId: 'root', plotId: UNSAVED_PLOT_ID, unsavedPlot })?.plot).toBe(
      unsavedPlot,
    );
    g.plots = [];
    expect(gateViewPlot(ws, g, { popId: 'root', plotId: null, unsavedPlot })?.plot).toBe(unsavedPlot);
  });

  it('builds the unsaved plot without changing the workspace, returning what it registers', () => {
    const { ws, g } = setup();
    const frozen = produce(ws, () => {});
    const shown = gateViewPlot(frozen, frozen.groups[0]!, sel('root'))!;
    expect(frozen.groups[0]!.plots).toEqual([]);
    expect(Object.keys(frozen.transforms)).toEqual([]);
    expect(Object.keys(shown.ws.groups[0]!.axisDefaults)).toEqual(['FSC-A', 'SSC-A']);
    expect(shown.ws.transforms[shown.plot.x.transform]).toBeDefined();
    expect(g.plots).toEqual([]);
  });
});

describe('addUnsaved and settleUnsaved', () => {
  /** Run `fn` on a draft given the Gate view's unsaved root plot, as `mutate` does. */
  function edit(ws: Workspace, fn: (w: Workspace) => void) {
    const shown = gateViewPlot(ws, ws.groups[0]!, sel('root'))!;
    let id: string | null = null;
    const [next, redo] = produceWithPatches(ws, (w) => {
      const added = addUnsaved(w, { groupId: 'g', ...shown })!;
      fn(w);
      id = settleUnsaved(w, added);
    });
    return { next, redo, id: id as string | null };
  }

  it('takes the plot out again when the edit leaves it and its gates alone', () => {
    const { ws } = setup();
    const r = edit(ws, (w) => {
      w.name = 'X';
    });
    expect(r.id).toBeNull();
    expect(r.next.groups[0]!.plots).toEqual([]);
    expect(r.next.transforms).toEqual({});
    expect(edit(ws, () => {}).redo).toEqual([]);
  });

  it('keeps it with a new id, and what building it registered, when the plot changes', () => {
    const { ws } = setup();
    const r = edit(ws, (w) => {
      w.groups[0]!.plots[0]!.style.pointPx = 5;
    });
    const saved = r.next.groups[0]!.plots[0]!;
    expect(saved.id).toBe(r.id);
    expect(saved.id).toMatch(/^plt_/);
    expect(saved.id).not.toBe(UNSAVED_PLOT_ID);
    expect(r.next.transforms[saved.x.transform]).toBeDefined();
    expect(Object.keys(r.next.groups[0]!.axisDefaults)).toEqual(['FSC-A', 'SSC-A']);
  });

  it('keeps it when a gate on it, its override or its label changes', () => {
    const { ws, g } = setup();
    const pop = addGate(ws, 'g', rect('root'));
    const gateId = g.template.populations[pop]!.gate!;
    const changes: ((w: Workspace) => void)[] = [
      (w) => void addGate(w, 'g', rect('root')),
      (w) =>
        void (w.groups[0]!.template.gates[gateId]!.geometry = { kind: 'rect', min: [0, 0], max: [2, 2] }),
      (w) =>
        void w.groups[0]!.overrides.push({
          sampleId: 's1',
          gateId,
          geometry: { kind: 'rect', min: [0, 0], max: [2, 2] },
          at: '',
        }),
      (w) => void (w.groups[0]!.template.populations[pop]!.labelOffset = [0.1, 0]),
    ];
    for (const fn of changes) expect(edit(ws, fn).id).not.toBeNull();
    // A gate on another population's plot is not on this one.
    expect(edit(ws, (w) => void addGate(w, 'g', rect(pop))).id).toBeNull();
  });
});
