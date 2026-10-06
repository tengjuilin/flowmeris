import { describe, expect, it } from 'vitest';
import { displayNames } from './names.ts';

const s = (id: string, relativePath: string, datasetIndex = 0) => ({
  id,
  fileName: relativePath.split('/').pop()!,
  relativePath,
  datasetIndex,
});

describe('displayNames', () => {
  it('strips the folder name and the common prefix/suffix', () => {
    const n = displayNames([
      s('a', 'exp1/exp1_2024-05-01_A01_stained.fcs'),
      s('b', 'exp1/exp1_2024-05-01_B02_stained.fcs'),
    ]);
    expect(n).toEqual({ a: 'A01', b: 'B02' });
  });

  it('trims only whole tokens', () => {
    const n = displayNames([s('a', 'run/Sample_A01.fcs'), s('b', 'run/Sample_A02.fcs')]);
    expect(n).toEqual({ a: 'A01', b: 'A02' });
  });

  it('keeps the full name of a lone file unless it repeats the folder', () => {
    expect(displayNames([s('a', 'plate1/plate1_A01.fcs')])).toEqual({ a: 'A01' });
    expect(displayNames([s('a', 'data1.fcs')])).toEqual({ a: 'data1' });
    expect(displayNames([s('a', 'exp/exp.fcs')])).toEqual({ a: 'exp' });
  });

  it('does not match the folder inside a longer token', () => {
    expect(displayNames([s('a', 'A1/A10_x.fcs')])).toEqual({ a: 'A10_x' });
  });

  it('falls back to full names rather than produce duplicates or empty labels', () => {
    const n = displayNames([s('a', 'f/A01.fcs'), s('b', 'f/A01_rep.fcs')]);
    expect(n).toEqual({ a: 'A01', b: 'A01_rep' });
  });

  it('labels extra datasets of one file', () => {
    const n = displayNames([s('a', 'f/multi.fcs', 0), s('b', 'f/multi.fcs', 1), s('c', 'f/other.fcs')]);
    expect(n).toEqual({ a: 'multi', b: 'multi #2', c: 'other' });
  });
});
