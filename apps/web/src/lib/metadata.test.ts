import type { Variable, Workspace } from '@flowmeris/model';
import { CATEGORICAL, colormapCss } from '@flowmeris/render';
import { describe, expect, it } from 'vitest';
import {
  activeVariable,
  addVariable,
  coerce,
  detectWells,
  distinctValues,
  normRect,
  pasteTargets,
  retype,
  setValue,
} from './metadata.ts';
import { inkOn, valueColors } from './palette.ts';

const at = (t: { r: number; c: number; raw: string }[]) => t.map(({ r, c, raw }) => `${r}${c}${raw}`);

describe('pasting into a selection', () => {
  it('fills the whole selection with a single value', () => {
    expect(at(pasteTargets([['x']], { r0: 2, c0: 1, r1: 0, c1: 2 }, 10, 5))).toEqual([
      '01x',
      '02x',
      '11x',
      '12x',
      '21x',
      '22x',
    ]);
  });

  it('repeats a block that fits the selection evenly', () => {
    expect(at(pasteTargets([['a'], ['b']], { r0: 0, c0: 0, r1: 3, c1: 0 }, 10, 5))).toEqual([
      '00a',
      '10b',
      '20a',
      '30b',
    ]);
  });

  it('places a block that does not fit at the top-left corner, clipped to the table', () => {
    expect(
      at(
        pasteTargets(
          [
            ['a', 'b'],
            ['c', 'd'],
          ],
          { r0: 4, c0: 3, r1: 6, c1: 4 },
          6,
          5,
        ),
      ),
    ).toEqual(['43a', '44b', '53c', '54d']);
    expect(at(pasteTargets([['a', 'b', 'c']], { r0: 0, c0: 3, r1: 0, c1: 3 }, 1, 5))).toEqual(['03a', '04b']);
  });
});

const variable = (id: string, type: Variable['type'], levels: string[] = []): Variable => ({
  id,
  name: id,
  type,
  levels,
});

/** A workspace with only what the metadata helpers read: variables and samples' values. */
function workspace(
  meta: Record<string, Record<string, number | string>>,
  variables: Variable[] = [],
): Workspace {
  return {
    variables,
    samples: Object.fromEntries(Object.entries(meta).map(([id, m]) => [id, { id, meta: { ...m } }])),
  } as unknown as Workspace;
}

describe('typed values from text', () => {
  it('reads numbers for numeric variables, trimmed text for categorical ones, and clears on blank', () => {
    expect(coerce(variable('d', 'numeric'), ' 1e3 ')).toBe(1000);
    expect(coerce(variable('d', 'numeric'), '-.5')).toBe(-0.5);
    expect(coerce(variable('d', 'numeric'), '10 nM')).toBeUndefined();
    expect(coerce(variable('d', 'numeric'), '1,000')).toBeUndefined();
    expect(coerce(variable('c', 'categorical'), '  WT ')).toBe('WT');
    expect(coerce(variable('c', 'categorical'), '   ')).toBeNull();
    expect(coerce(variable('d', 'numeric'), '')).toBeNull();
  });

  it('sets and clears one sample’s value, ignoring unknown samples', () => {
    const ws = workspace({ s1: { d: 1 } });
    setValue(ws, 's1', 'd', 5);
    expect(ws.samples.s1!.meta).toEqual({ d: 5 });
    setValue(ws, 's1', 'd', null);
    expect(ws.samples.s1!.meta).toEqual({});
    expect('d' in ws.samples.s1!.meta).toBe(false);
    expect(() => setValue(ws, 'nope', 'd', 1)).not.toThrow();
  });
});

describe('adding and retyping variables', () => {
  it('makes names unique and defaults blank names', () => {
    const ws = workspace({});
    addVariable(ws, 'Dose', 'numeric', 'nM');
    addVariable(ws, ' Dose ', 'numeric');
    addVariable(ws, 'Dose', 'categorical');
    addVariable(ws, '  ', 'categorical');
    addVariable(ws, '', 'categorical');
    expect(ws.variables.map((v) => v.name)).toEqual(['Dose', 'Dose 2', 'Dose 3', 'Variable', 'Variable 2']);
    expect(ws.variables[0]!.unit).toBe('nM');
    expect('unit' in ws.variables[1]!).toBe(false);
    expect(new Set(ws.variables.map((v) => v.id)).size).toBe(5);
    expect(ws.variables.every((v) => v.id.startsWith('var_') && v.levels.length === 0)).toBe(true);
  });

  it('numeric to categorical turns numbers into text and drops nothing', () => {
    const ws = workspace({ a: { v: 1.5 }, b: { v: 10 }, c: {} }, [variable('v', 'numeric')]);
    expect(retype(ws, 'v', 'categorical')).toBe(0);
    expect(ws.variables[0]!.type).toBe('categorical');
    expect([ws.samples.a!.meta.v, ws.samples.b!.meta.v]).toEqual(['1.5', '10']);
    expect('v' in ws.samples.c!.meta).toBe(false);
  });

  it('categorical to numeric keeps numbers, drops other text, counts the drops and clears the level order', () => {
    const ws = workspace({ a: { v: '2' }, b: { v: 'high' }, c: { v: ' 3e1' }, d: { v: 'n/a' } }, [
      variable('v', 'categorical', ['2', 'high']),
    ]);
    expect(retype(ws, 'v', 'numeric')).toBe(2);
    expect(ws.samples.a!.meta.v).toBe(2);
    expect(ws.samples.c!.meta.v).toBe(30);
    expect('v' in ws.samples.b!.meta).toBe(false);
    expect('v' in ws.samples.d!.meta).toBe(false);
    expect(ws.variables[0]!.levels).toEqual([]);
  });

  it('does nothing for an unknown variable or the same type', () => {
    const ws = workspace({ a: { v: 'x' } }, [variable('v', 'categorical')]);
    expect(retype(ws, 'v', 'categorical')).toBe(0);
    expect(retype(ws, 'nope', 'numeric')).toBe(0);
    expect(ws.samples.a!.meta.v).toBe('x');
  });
});

describe('distinct values and their colours', () => {
  it('lists each value once among the given samples, numbers ascending, categories in level order', () => {
    const ws = workspace({ a: { n: 10, c: 'lo' }, b: { n: 2, c: 'hi' }, c: { n: 10, c: '' }, d: { n: 99 } });
    expect(distinctValues(ws, variable('n', 'numeric'), ['a', 'b', 'c', 'missing'])).toEqual([2, 10]);
    expect(distinctValues(ws, variable('c', 'categorical', ['lo', 'hi']), ['a', 'b', 'c'])).toEqual([
      'lo',
      'hi',
    ]);
    expect(distinctValues(ws, variable('c', 'categorical', ['hi', 'lo']), ['a', 'b', 'c'])).toEqual([
      'hi',
      'lo',
    ]);
  });

  it('categories take palette slots in order and repeat past the palette', () => {
    const values = Array.from({ length: CATEGORICAL.length + 1 }, (_, i) => `v${i}`);
    const { color, legend, scale } = valueColors(variable('c', 'categorical'), values);
    expect(scale).toBeUndefined();
    expect(legend.map((l) => l.label)).toEqual(values);
    expect(color('v0')).toBe(CATEGORICAL[0]);
    expect(color('v1')).toBe(CATEGORICAL[1]);
    expect(color(`v${CATEGORICAL.length}`)).toBe(CATEGORICAL[0]);
    expect(color('other')).toBeUndefined();
    expect(color(undefined)).toBeUndefined();
  });

  it('numbers use a linear ramp, or a log ramp when positive and spanning 100× or more', () => {
    const lin = valueColors(variable('n', 'numeric'), [0, 5, 10]);
    expect(lin.scale).toEqual({ min: 0, max: 10, log: false });
    expect(lin.color(0)).toBe(colormapCss('viridis', 0.15));
    expect(lin.color(5)).toBe(colormapCss('viridis', 0.55));
    expect(lin.color(10)).toBe(colormapCss('viridis', 0.95));
    expect(lin.color('x')).toBeUndefined();

    const log = valueColors(variable('n', 'numeric'), [1, 10, 100]);
    expect(log.scale).toEqual({ min: 1, max: 100, log: true });
    expect(log.color(10)).toBe(colormapCss('viridis', 0.55));
    expect(valueColors(variable('n', 'numeric'), [1, 99]).scale!.log).toBe(false);
    expect(valueColors(variable('n', 'numeric'), [-1, 1000]).scale!.log).toBe(false);
  });

  it('a single number sits mid-ramp; no numbers give no colours', () => {
    const one = valueColors(variable('n', 'numeric'), [7]);
    expect(one.color(7)).toBe(colormapCss('viridis', 0.55));
    const none = valueColors(variable('n', 'numeric'), ['a', Number.NaN]);
    expect(none.legend).toEqual([]);
    expect(none.scale).toBeUndefined();
    expect(none.color(1)).toBeUndefined();
  });

  it('picks dark ink on light backgrounds and white on dark ones', () => {
    expect(inkOn('#ffffff')).toBe('#111');
    expect(inkOn('#fde725')).toBe('#111');
    expect(inkOn('#000000')).toBe('#fff');
    expect(inkOn('#440154')).toBe('#fff');
    expect(inkOn('rgb(250, 250, 250)')).toBe('#111');
    expect(inkOn('rgb(20,30,40)')).toBe('#fff');
  });
});

describe('cell selections', () => {
  it('normalises a rectangle dragged from any corner', () => {
    const want = { r0: 1, c0: 2, r1: 4, c1: 5 };
    expect(normRect({ r0: 4, c0: 5, r1: 1, c1: 2 })).toEqual(want);
    expect(normRect({ r0: 1, c0: 5, r1: 4, c1: 2 })).toEqual(want);
    expect(normRect(want)).toEqual(want);
  });

  it('pastes nothing from an empty clipboard, and ragged rows only where they have cells', () => {
    expect(pasteTargets([], { r0: 0, c0: 0, r1: 0, c1: 0 }, 5, 5)).toEqual([]);
    expect(pasteTargets([[]], { r0: 0, c0: 0, r1: 0, c1: 0 }, 5, 5)).toEqual([]);
    expect(at(pasteTargets([['a', 'b'], ['c']], { r0: 0, c0: 0, r1: 0, c1: 0 }, 5, 5))).toEqual([
      '00a',
      '01b',
      '10c',
    ]);
  });
});

describe('the Metadata view’s variables and wells', () => {
  it('shows the selected variable, else the first', () => {
    const vars = [
      { id: 'a', name: 'A', type: 'numeric', levels: [] },
      { id: 'b', name: 'B', type: 'numeric', levels: [] },
    ] as Variable[];
    expect(activeVariable(vars, 'b')).toBe(vars[1]);
    expect(activeVariable(vars, '')).toBe(vars[0]);
    expect(activeVariable(vars, null)).toBe(vars[0]);
    expect(activeVariable([], 'b')).toBeUndefined();
  });

  it('finds wells from keywords or file names, keeping wells already set', () => {
    const sample = (id: string, fileName: string, keywords = {}, well?: string) => ({
      id,
      fileName,
      keywords,
      meta: {},
      ...(well ? { well } : {}),
    });
    const ws = {
      samples: {
        k: sample('k', 'x.fcs', { $WELLID: 'c4' }),
        f: sample('f', 'Plate1_B07.fcs'),
        set: sample('set', 'A01.fcs', {}, 'H12'),
        none: sample('none', 'tube.fcs'),
      },
    } as unknown as Workspace;
    expect(detectWells(ws, ['k', 'f', 'set', 'none', 'gone'])).toBe(2);
    expect(Object.values(ws.samples).map((s) => s.well)).toEqual(['C04', 'B07', 'H12', undefined]);
  });
});
