import type { Variable, Workspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import {
  type PartialWell,
  blockText,
  filterLevels,
  metaCellValue,
  rejectMessage,
  wellParts,
  writeMetaCell,
} from './metaTable.ts';

const vars: Variable[] = [
  { id: 'dose', name: 'Dose', type: 'numeric', levels: [] },
  { id: 'cond', name: 'Condition', type: 'categorical', levels: [] },
];
const ws = (): Workspace =>
  ({
    samples: { s1: { id: 's1', meta: {} }, s2: { id: 's2', well: 'B07', meta: {} } },
  }) as unknown as Workspace;

describe('the metadata table', () => {
  it('reads a well as its row and column, or the half typed so far', () => {
    expect(wellParts('B07', undefined)).toEqual({ row: 'B', col: 7 });
    expect(wellParts(undefined, { row: 'C' })).toEqual({ row: 'C' });
    expect(wellParts(undefined, undefined)).toEqual({});
  });

  it('writes a well, normalized, and refuses one off the plate', () => {
    const w = ws();
    const partial = new Map<string, PartialWell>();
    expect(writeMetaCell(w, 's1', vars, 0, 'a3', partial)).toBe(true);
    expect(w.samples.s1!.well).toBe('A03');
    expect(writeMetaCell(w, 's1', vars, 0, 'Z99', partial)).toBe(false);
    expect(w.samples.s1!.well).toBe('A03');
    expect(writeMetaCell(w, 's1', vars, 0, ' ', partial)).toBe(true);
    expect(w.samples.s1!.well).toBeUndefined();
  });

  it('keeps a row typed without a column until the column completes the well', () => {
    const w = ws();
    const partial = new Map<string, PartialWell>();
    writeMetaCell(w, 's1', vars, 1, 'c', partial);
    expect(w.samples.s1!.well).toBeUndefined();
    expect(metaCellValue(w, 's1', vars, 1, partial)).toBe('C');
    expect(writeMetaCell(w, 's1', vars, 2, '13', partial)).toBe(false);
    writeMetaCell(w, 's1', vars, 2, '5', partial);
    expect(w.samples.s1!.well).toBe('C05');
    expect(partial.size).toBe(0);
    // Clearing the row of a full well leaves its column pending.
    writeMetaCell(w, 's2', vars, 1, '', partial);
    expect(w.samples.s2!.well).toBeUndefined();
    expect(partial.get('s2')).toEqual({ col: 7 });
    expect(metaCellValue(w, 's2', vars, 2, partial)).toBe(7);
  });

  it('writes variable values by type, and refuses text in a numeric one', () => {
    const w = ws();
    const partial = new Map<string, PartialWell>();
    expect(writeMetaCell(w, 's1', vars, 3, '1e3', partial)).toBe(true);
    expect(writeMetaCell(w, 's1', vars, 4, ' drug ', partial)).toBe(true);
    expect(writeMetaCell(w, 's1', vars, 3, 'high', partial)).toBe(false);
    expect(w.samples.s1!.meta).toEqual({ dose: 1000, cond: 'drug' });
    expect(metaCellValue(w, 's1', vars, 3, partial)).toBe(1000);
    writeMetaCell(w, 's1', vars, 3, '', partial);
    expect(w.samples.s1!.meta).toEqual({ cond: 'drug' });
    expect(writeMetaCell(w, 'gone', vars, 3, 'x', partial)).toBe(true);
  });

  it('says why a value was refused', () => {
    expect(rejectMessage(0, 'Z1', vars)).toBe('“Z1” is not a well of a 96-well plate (A01–H12).');
    expect(rejectMessage(1, 'Q', vars)).toBe('“Q” is not a plate row (A–H).');
    expect(rejectMessage(2, '0', vars)).toBe('“0” is not a plate column (1–12).');
    expect(rejectMessage(3, 'x', vars)).toBe('“x” is not a number (Dose is numeric).');
  });

  it('copies a block as tab-separated lines', () => {
    expect(blockText({ r0: 1, c0: 0, r1: 2, c1: 1 }, (r, c) => `${r}${c}`)).toBe('10\t11\n20\t21');
  });

  it('offers the categories containing what was typed', () => {
    const levels = ['Control', 'Drug A', 'drug B'];
    expect(filterLevels(levels, null)).toBe(levels);
    expect(filterLevels(levels, '  ')).toBe(levels);
    expect(filterLevels(levels, 'DRUG')).toEqual(['Drug A', 'drug B']);
  });
});
