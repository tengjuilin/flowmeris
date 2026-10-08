import { type Group, type RidgeLayout, newWorkspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERLAP,
  DEFAULT_RIDGE_STYLE,
  applyOrder,
  applyRidgeToChannels,
  applyRidgeToPopulations,
  carryRidge,
  combineCounts,
  comboRows,
  resetRidgeChannel,
  resetRidgeLayout,
  ridgeAtDefaults,
  ridgeChannelAtDefaults,
  ridgeChannelsMatch,
  ridgePopulationsMatch,
  selectRidges,
  setRidgeChannelStyles,
  withRidgeChannel,
  wrapText,
} from './ridge.ts';

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

describe('wrapping ridge labels', () => {
  const m = (s: string) => s.length * 10;
  it('keeps a short label on one line', () => {
    expect(wrapText('WT_rep1', 100, m)).toEqual(['WT_rep1']);
  });
  it('breaks at separators without losing text', () => {
    const lines = wrapText('2024-05 CD4 stim_rep1 (n=1,234)', 100, m);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => m(l) <= 100)).toBe(true);
    expect(lines.join('').replace(/\s/g, '')).toBe('2024-05CD4stim_rep1(n=1,234)');
  });
  it('breaks a word wider than the column between characters', () => {
    expect(wrapText('abcdefghijkl', 50, m)).toEqual(['abcde', 'fghij', 'kl']);
  });
});

const ridge = (id: string, color = '#111111', ch = 'A') =>
  ({
    kind: 'ridge',
    id,
    population: id,
    axis: { channel: ch },
    overlap: DEFAULT_OVERLAP,
    norm: 'mode',
    style: { ...structuredClone(DEFAULT_RIDGE_STYLE), color },
  }) as unknown as RidgeLayout;
const setCh = (l: RidgeLayout, ch: string) =>
  withRidgeChannel(l, () => void (l.axis = { ...l.axis, channel: ch }));

describe('carrying and applying ridge settings across populations', () => {
  it('carries settings to the population opened next, keeping its ticks and axis title', () => {
    const a = ridge('a', '#222222');
    a.overlap = 0.3;
    const b = ridge('b');
    b.style.axisTitle = 'B';
    expect(carryRidge(a, b)).toBe(true);
    expect(b.style.color).toBe('#222222');
    expect(b.overlap).toBe(0.3);
    expect(b.style.axisTitle).toBe('B');
    expect(carryRidge(a, b)).toBe(false);
  });

  it('applies to every population now', () => {
    const g = { layouts: [ridge('a', '#222222'), ridge('b'), ridge('c')] } as unknown as Group;
    expect(ridgePopulationsMatch(g, 'a')).toBe(false);
    applyRidgeToPopulations(g, 'a');
    expect(ridgePopulationsMatch(g, 'a')).toBe(true);
  });
});

describe('ridge settings per axis channel', () => {
  it('carries the settings in use to the next channel while carrying is on', () => {
    const l = ridge('l', '#222222');
    expect(setCh(l, 'B')).toBe(false);
    expect(l.style.color).toBe('#222222');
    expect(l.stylesByChannel?.A?.style.color).toBe('#222222');
  });

  it('restores each channel’s own settings while carrying is off; unused ones start at the defaults', () => {
    const l = ridge('l', '#222222');
    setRidgeChannelStyles(l, true);
    setCh(l, 'B');
    expect(l.style.color).toBe(DEFAULT_RIDGE_STYLE.color);
    l.style.color = '#333333';
    expect(setCh(l, 'A')).toBe(true);
    expect(l.style.color).toBe('#222222');
    setCh(l, 'B');
    expect(l.style.color).toBe('#333333');
  });

  it('applies to every channel now, including unused ones', () => {
    const l = ridge('l', '#222222');
    setRidgeChannelStyles(l, true);
    setCh(l, 'B');
    l.style.color = '#333333';
    expect(ridgeChannelsMatch(l)).toBe(false);
    applyRidgeToChannels(l);
    expect(ridgeChannelsMatch(l)).toBe(true);
    setCh(l, 'A');
    expect(l.style.color).toBe('#333333');
    setCh(l, 'C');
    expect(l.style.color).toBe('#333333');
  });

  it('resets one channel in every population and leaves the others', () => {
    const a = ridge('a', '#222222');
    const b = ridge('b', '#444444', 'B');
    setRidgeChannelStyles(b, true);
    b.stylesByChannel = {
      A: { style: { ...structuredClone(DEFAULT_RIDGE_STYLE), color: '#555555' }, overlap: 0.6 },
    };
    const g = { layouts: [a, b] } as unknown as Group;
    resetRidgeChannel(g, 'A');
    expect(a.style.color).toBe(DEFAULT_RIDGE_STYLE.color);
    expect(b.style.color).toBe('#444444');
    expect(b.stylesByChannel.A?.style.color).toBe(DEFAULT_RIDGE_STYLE.color);
    expect(ridgeChannelAtDefaults(g, 'A')).toBe(true);
    expect(ridgeAtDefaults(b)).toBe(false);
    resetRidgeLayout(b);
    expect(ridgeAtDefaults(b)).toBe(true);
  });
});
