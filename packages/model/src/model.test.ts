import { describe, expect, it } from 'vitest';
import { RidgeStyleSchema, loadWorkspace, newGroup, newWorkspace } from './index.ts';

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
