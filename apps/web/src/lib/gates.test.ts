import { type Gate, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { addGate } from './gates.ts';

function workspace(): Workspace {
  const ws = newWorkspace('W', { version: 'test', commit: 'test', kernels: 'test' });
  const g = newGroup('G', ['s1'], ['FSC-A', 'FL1-A']);
  g.id = 'g';
  ws.groups.push(g);
  ws.samples.s1 = {
    channels: [{ pnn: 'FSC-A' }, { pnn: 'FL1-A', pns: 'GFP' }],
  } as unknown as Workspace['samples'][string];
  return ws;
}

const dims = [
  { channel: 'FSC-A', comp: 'group' as const, transform: null },
  { channel: 'FL1-A', comp: 'group' as const, transform: null },
];
const gate = (geometry: Gate['geometry'], n = 2): Omit<Gate, 'id'> => ({
  parentPop: 'root',
  dims: dims.slice(0, n),
  geometry,
});
const names = (ws: Workspace) =>
  Object.values(ws.groups[0]!.template.populations)
    .filter((p) => p.id !== 'root')
    .map((p) => [p.region, p.name]);

describe('adding a gate', () => {
  it('names a single-population gate by its base name, else by number', () => {
    const ws = workspace();
    const first = addGate(ws, 'g', gate({ kind: 'rect', min: [0, 0], max: [1, 1] }), 'Lymphocytes');
    addGate(ws, 'g', gate({ kind: 'rect', min: [0, 0], max: [1, 1] }));
    expect(names(ws)).toEqual([
      ['in', 'Lymphocytes'],
      ['in', 'Gate 2'],
    ]);
    expect(ws.groups[0]!.template.populations[first]!.name).toBe('Lymphocytes');
  });

  it('names quadrants by marker (pns, else pnn) and returns Q1', () => {
    const ws = workspace();
    const first = addGate(ws, 'g', gate({ kind: 'quadrant', center: [0, 0] }));
    expect(names(ws)).toEqual([
      ['Q1', 'Q1: FSC-A− GFP+'],
      ['Q2', 'Q2: FSC-A+ GFP+'],
      ['Q3', 'Q3: FSC-A+ GFP−'],
      ['Q4', 'Q4: FSC-A− GFP−'],
    ]);
    expect(ws.groups[0]!.template.populations[first]!.region).toBe('Q1');
  });

  it('names a split gate marker− and marker+', () => {
    const ws = workspace();
    addGate(ws, 'g', { ...gate({ kind: 'split', at: 1 }, 1), dims: [dims[1]!] });
    expect(names(ws)).toEqual([
      ['lo', 'GFP−'],
      ['hi', 'GFP+'],
    ]);
  });

  it('gives populations the gate as parent and distinct colours', () => {
    const ws = workspace();
    addGate(ws, 'g', gate({ kind: 'quadrant', center: [0, 0] }));
    const pops = Object.values(ws.groups[0]!.template.populations).filter((p) => p.id !== 'root');
    expect(new Set(pops.map((p) => p.gate)).size).toBe(1);
    expect(pops.every((p) => p.parent === 'root')).toBe(true);
    expect(new Set(pops.map((p) => p.color)).size).toBe(4);
  });
});
