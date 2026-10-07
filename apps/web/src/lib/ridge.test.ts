import { newWorkspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { applyOrder, combineCounts, comboRows } from './ridge.ts';

const h = (counts: number[]) => ({
  centers: Float64Array.from(counts, (_, i) => i),
  heights: Float64Array.from(counts),
  eventsPlotted: counts.reduce((a, b) => a + b, 0),
});

describe('combining replicate histograms', () => {
  it('scales a single histogram to its mode', () => {
    const c = combineCounts([h([1, 4, 2])], 'mean', 'sd')!;
    expect([...c.heights]).toEqual([0.25, 1, 0.5]);
    expect(c.band).toBeUndefined();
    expect(c.events).toBe(7);
  });

  it('pools events, weighting replicates by their event count', () => {
    const c = combineCounts([h([0, 10]), h([2, 0])], 'pool', 'none')!;
    expect([...c.heights]).toEqual([0.2, 1]);
    expect(c.events).toBe(12);
  });

  it('averages unit-area curves, weighting replicates equally', () => {
    const c = combineCounts([h([0, 10]), h([2, 0])], 'mean', 'none')!;
    expect([...c.heights]).toEqual([1, 1]);
  });

  it('gives an SD and SEM band on the curve scale', () => {
    const reps = [h([1, 3]), h([3, 1])];
    const sd = combineCounts(reps, 'mean', 'sd')!;
    expect([...sd.heights]).toEqual([1, 1]);
    // Unit-area values 0.25 and 0.75: mean 0.5, SD √0.125, scaled by 1 / 0.5.
    expect(sd.band!.hi[0]).toBeCloseTo(1 + 2 * Math.sqrt(0.125));
    expect(sd.band!.lo[0]).toBe(Math.max(0, 1 - 2 * Math.sqrt(0.125)));
    const sem = combineCounts(reps, 'mean', 'sem')!;
    expect(sem.band!.hi[0]).toBeCloseTo(1 + (2 * Math.sqrt(0.125)) / Math.SQRT2);
  });

  it('leaves out replicates without events from the mean', () => {
    const c = combineCounts([h([0, 0]), h([1, 2])], 'mean', 'sd')!;
    expect(c.n).toBe(1);
    expect([...c.heights]).toEqual([0.5, 1]);
    expect(c.band).toBeUndefined();
  });
});

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
});
