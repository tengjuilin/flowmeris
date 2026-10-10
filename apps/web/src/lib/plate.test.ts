import type { Workspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import {
  type Series,
  fillSeries,
  fmtWellValue,
  rampGradient,
  samplesByWell,
  seriesSteps,
  seriesValue,
  wellRect,
} from './plate.ts';

const ws = (): Workspace =>
  ({
    samples: {
      a: { id: 'a', well: 'A01', meta: {} },
      b: { id: 'b', well: 'A01', meta: {} },
      c: { id: 'c', well: 'B03', meta: {} },
      d: { id: 'd', meta: {} },
    },
  }) as unknown as Workspace;

describe('the plate map', () => {
  it('shows values to 4 significant digits, very small or large ones as exponents', () => {
    expect(fmtWellValue(undefined)).toBe('');
    expect(fmtWellValue('x')).toBe('x');
    expect(fmtWellValue(0)).toBe('0');
    expect(fmtWellValue(1.23456)).toBe('1.235');
    expect(fmtWellValue(0.0005)).toBe('5.00e-4');
    expect(fmtWellValue(123456)).toBe('1.23e+5');
  });

  it('selects the rectangle between two wells, whichever corners', () => {
    expect(wellRect('B02', 'A01')).toEqual(['A01', 'A02', 'B01', 'B02']);
  });

  it('groups samples by well, skipping those without one or not listed', () => {
    expect([...samplesByWell(ws(), ['a', 'b', 'c', 'd'])]).toEqual([
      ['A01', ['a', 'b']],
      ['B03', ['c']],
    ]);
    expect([...samplesByWell(ws(), ['c'])]).toEqual([['B03', ['c']]]);
  });
});

describe('filling a series', () => {
  const dilution: Series = { start: 100, step: 0.5, op: 'mul', along: 'cols' };

  it('steps once per selected column (or row), in order', () => {
    expect(seriesSteps(['A05', 'B01', 'A01', 'C03'], 'cols')).toEqual([0, 2, 4]);
    expect(seriesSteps(['A05', 'B01', 'A01', 'C03'], 'rows')).toEqual([0, 1, 2]);
  });

  it('multiplies or adds, rounded to 12 significant digits', () => {
    expect([0, 1, 2].map((i) => seriesValue(dilution, i))).toEqual([100, 50, 25]);
    expect(seriesValue({ ...dilution, start: 0.1, step: 0.2, op: 'add' }, 1)).toBe(0.3);
  });

  it('sets each well’s samples to the value of its column', () => {
    const w = ws();
    fillSeries(w, 'dose', ['B03', 'A01'], samplesByWell(w, ['a', 'b', 'c']), dilution);
    expect(Object.values(w.samples).map((s) => s.meta.dose)).toEqual([100, 100, 50, undefined]);
  });

  it('draws a numeric scale’s ramp in even steps, geometric on a log scale', () => {
    const at = (x: number) => String(x);
    expect(rampGradient({ min: 0, max: 4, log: false }, at)).toBe('linear-gradient(to right, 0,1,2,3,4)');
    expect(rampGradient({ min: 1, max: 10000, log: true }, at)).toBe(
      'linear-gradient(to right, 1,10,100,1000,10000)',
    );
  });
});
