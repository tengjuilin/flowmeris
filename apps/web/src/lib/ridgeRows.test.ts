import { newWorkspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { applyOrder, comboRows, selectRidges } from './ridgeRows.ts';

describe('replicate groups', () => {
  const ws = newWorkspace('t', { version: '0', commit: 'x', kernels: 'ts-1' });
  ws.variables.push(
    { id: 'cond', name: 'Condition', type: 'categorical', levels: ['ctrl', 'drug'] },
    { id: 'dose', name: 'Dose', type: 'numeric', unit: 'µM', levels: [] },
  );
  const meta: Record<string, Record<string, string | number>> = {
    a: { cond: 'drug', dose: 10 },
    b: { cond: 'ctrl', dose: 1 },
    c: { cond: 'drug', dose: 10 },
    d: { cond: 'drug', dose: 2 },
    e: {},
  };
  for (const [id, m] of Object.entries(meta)) ws.samples[id] = { meta: m } as never;

  it('forms one ridge per combination of values, in value order', () => {
    const rows = comboRows(ws, Object.keys(meta), ['cond', 'dose']);
    expect(rows.map((r) => [r.label, r.sampleIds])).toEqual([
      ['ctrl · 1 µM', ['b']],
      ['drug · 2 µM', ['d']],
      ['drug · 10 µM', ['a', 'c']],
      ['no Condition · no Dose', ['e']],
    ]);
  });

  it('combines every sample when grouped by nothing', () => {
    expect(comboRows(ws, ['a', 'b'], [])).toEqual([
      { id: 'combo:{}', label: 'All samples', sampleIds: ['a', 'b'] },
    ]);
  });

  it('orders listed ids first', () => {
    expect(applyOrder(['a', 'b', 'c'], ['c', 'x', 'a'])).toEqual(['c', 'a', 'b']);
  });

  it('drops hidden ridges, excluded replicates and ridges left empty', () => {
    const rows = comboRows(ws, Object.keys(meta), ['cond', 'dose']);
    const [ctrl, drug2, drug10, none] = rows.map((r) => r.id);
    const shown = selectRidges(rows, [ctrl!], ['c', 'd']);
    expect(shown.map((r) => [r.id, r.sampleIds])).toEqual([
      [drug10, ['a']],
      [none, ['e']],
    ]);
    expect(shown.some((r) => r.id === drug2)).toBe(false);
    expect(rows[2]!.sampleIds).toEqual(['a', 'c']);
  });
});
