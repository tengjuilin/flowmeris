import { type PlotSpec, newGroup, newWorkspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { addGate } from './gates.ts';
import { lineageKey, plotKey } from './keys.ts';

function setup() {
  const ws = newWorkspace('W', { version: 'test', commit: 'test', kernels: 'test' });
  const g = newGroup('G', ['s1', 's2'], ['A', 'B']);
  g.id = 'g';
  ws.groups.push(g);
  ws.transforms.t1 = { kind: 'flin', A: 0, T: 1 };
  const pop = addGate(ws, 'g', {
    parentPop: 'root',
    dims: [{ channel: 'A', comp: 'group', transform: 't1' }],
    geometry: { kind: 'rect', min: [0], max: [1] },
  });
  return { ws, g: ws.groups[0]!, pop };
}

describe('dependency keys', () => {
  it('change with the gate geometry, transform and compensation but not with names', () => {
    const { ws, g, pop } = setup();
    const k0 = lineageKey(ws, g, 's1', pop);
    g.template.populations[pop]!.name = 'Renamed';
    expect(lineageKey(ws, g, 's1', pop)).toBe(k0);
    const gate = Object.values(g.template.gates)[0]!;
    gate.geometry = { kind: 'rect', min: [0], max: [2] };
    const k1 = lineageKey(ws, g, 's1', pop);
    expect(k1).not.toBe(k0);
    (ws.transforms.t1 as unknown as { T: number }).T = 2;
    const k2 = lineageKey(ws, g, 's1', pop);
    expect(k2).not.toBe(k1);
    g.compensation = { mode: 'none' } as typeof g.compensation;
    expect(lineageKey(ws, g, 's1', pop)).not.toBe(k2);
  });

  it('follow a sample’s override only for that sample', () => {
    const { ws, g, pop } = setup();
    const gateId = Object.keys(g.template.gates)[0]!;
    const [a, b] = [lineageKey(ws, g, 's1', pop), lineageKey(ws, g, 's2', pop)];
    g.overrides.push({ gateId, sampleId: 's2', geometry: { kind: 'rect', min: [0], max: [3] }, at: '' });
    expect(lineageKey(ws, g, 's1', pop)).toBe(a);
    expect(lineageKey(ws, g, 's2', pop)).not.toBe(b);
  });

  it('of a plot change with its settings and axis transforms', () => {
    const { ws, g, pop } = setup();
    const plot = {
      id: 'p',
      population: pop,
      kind: 'histogram',
      x: { channel: 'B', comp: 'group', transform: 't1', range: [0, 1] },
      style: {},
    } as unknown as PlotSpec;
    const k0 = plotKey(ws, g, 's1', plot);
    expect(plotKey(ws, g, 's1', { ...plot, kind: 'dot' })).not.toBe(k0);
    (ws.transforms.t1 as unknown as { T: number }).T = 5;
    expect(plotKey(ws, g, 's1', plot)).not.toBe(k0);
  });
});
