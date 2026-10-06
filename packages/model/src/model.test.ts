import { describe, expect, it } from 'vitest';
import { RidgeStyleSchema, loadWorkspace, newGroup, newWorkspace, removeGateCascade } from './index.ts';

describe('ridge layout style', () => {
  it('fills every default from an empty object', () => {
    const s = RidgeStyleSchema.parse({});
    expect(s.colorMode).toBe('single');
    expect(s.order).toEqual([]);
    expect(s.ticks).toBeUndefined();
  });

  it('loads ridge layouts saved without a style', () => {
    const ws = newWorkspace('t', { version: '0', commit: 'x', kernels: 'ts-1' });
    const g = newGroup('g', [], ['FSC-A']);
    g.layouts.push({
      kind: 'ridge',
      id: 'lay_1',
      population: 'root',
      axis: { channel: 'FSC-A', comp: 'group', transform: 't_1', range: [0, 1] },
      overlap: 0.6,
      norm: 'mode',
    } as never);
    ws.groups.push(g);
    const loaded = loadWorkspace(JSON.parse(JSON.stringify(ws)));
    const l = loaded.groups[0]!.layouts[0]!;
    expect(l.kind === 'ridge' && l.style.fillOpacity).toBe(0.55);
  });

  it('rejects malformed colours', () => {
    expect(() => RidgeStyleSchema.parse({ color: 'blue' })).toThrow();
  });
});

describe('reference plots', () => {
  const axis = {
    channel: 'FSC-A',
    comp: 'group' as const,
    transform: 't_1',
    range: [0, 1] as [number, number],
  };

  it('loads groups saved before reference plots existed', () => {
    const ws = newWorkspace('t', { version: '0', commit: 'x', kernels: 'ts-1' });
    const { refPlots: _, ...old } = newGroup('g', [], ['FSC-A']);
    ws.groups.push(old as never);
    expect(loadWorkspace(JSON.parse(JSON.stringify(ws))).groups[0]!.refPlots).toEqual([]);
  });

  it('unpins reference plots whose population is removed', () => {
    const g = newGroup('g', [], ['FSC-A']);
    g.template.gates.gt_1 = { id: 'gt_1', parentPop: 'root' } as never;
    g.template.populations.pop_1 = { id: 'pop_1', parent: 'root', gate: 'gt_1' } as never;
    g.refPlots.push(
      { id: 'ref_1', population: 'pop_1', kind: 'histogram', x: axis, style: {} as never, backgate: false },
      { id: 'ref_2', population: 'root', kind: 'histogram', x: axis, style: {} as never, backgate: false },
    );
    removeGateCascade(g, 'gt_1');
    expect(g.refPlots.map((r) => r.population)).toEqual([undefined, 'root']);
  });
});
