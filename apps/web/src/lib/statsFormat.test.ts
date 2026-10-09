import type { ColumnDef, Table } from '@flowmeris/table';
import { describe, expect, it } from 'vitest';
import { fracDigits } from './format.ts';
import { exportKeys, fmtStat, sectionOf } from './statsFormat.ts';

describe('statistics table cells', () => {
  it('counts and n are integers, without thousands separators', () => {
    expect(fmtStat(13367, 'count')).toBe('13367');
    expect(fmtStat(1234567.4, 'count')).toBe('1234567');
    expect(fmtStat(3, 'n')).toBe('3');
  });

  it('percentages and CVs to 2 significant figures, 100 and above as integers', () => {
    expect(fmtStat(12.345, 'pctParent')).toBe('12');
    expect(fmtStat(1.2345, 'pctTotal')).toBe('1.2');
    expect(fmtStat(0.012345, 'pctGrandparent')).toBe('0.012');
    expect(fmtStat(5, 'pctParent')).toBe('5.0');
    expect(fmtStat(99.96, 'pctParent')).toBe('100');
    expect(fmtStat(100, 'pctParent')).toBe('100');
    expect(fmtStat(123.4, 'cv')).toBe('120');
    expect(fmtStat(45.67, 'rcv')).toBe('46');
    expect(fmtStat(0, 'pctParent')).toBe('0.0');
  });

  it('other statistics as integers; derived columns to their significant figures', () => {
    expect(fmtStat(1234.56, 'median')).toBe('1235');
    expect(fmtStat(-0.4, 'mean')).toBe('0');
    expect(fmtStat(1234.56, 'mean', 3)).toBe('1230');
    expect(fmtStat(0.0012345, undefined, 2)).toBe('0.0012');
    expect(fmtStat(2, undefined, 3)).toBe('2.00');
  });

  it('sample variables as entered, not rounded', () => {
    expect(fmtStat(2.5, 'value')).toBe('2.5');
    expect(fmtStat(0.1, 'value')).toBe('0.1');
    expect(fmtStat(1000, 'value')).toBe('1000');
    expect(fmtStat(-3, 'value')).toBe('-3');
  });

  it('text, missing and NaN', () => {
    expect(fmtStat(undefined, 'count')).toBe('');
    expect(fmtStat('A01', undefined)).toBe('A01');
    expect(fmtStat(Number.NaN, 'pctParent')).toBe('NaN');
    expect(fmtStat(Number.POSITIVE_INFINITY, undefined, 3)).toBe('Infinity');
  });

  it('digits after the decimal point, for aligning a column', () => {
    expect(fracDigits('12')).toBe(0);
    expect(fracDigits('1.50')).toBe(2);
    expect(fracDigits('-0.012')).toBe(3);
    expect(fracDigits('1.2e-7')).toBe(0);
    expect(fracDigits('NaN')).toBe(0);
  });
});

const c = (key: string, kind: ColumnDef['kind'], extra: Partial<ColumnDef> = {}): ColumnDef => ({
  key,
  label: key,
  type: 'numeric',
  kind,
  ...extra,
});

describe('table sections', () => {
  const cols = [
    c('sample:name', 'sample'),
    c('var:dose', 'variable'),
    c('p1|count', 'stat', { pop: 'p1' }),
    c('dc_1', 'derived'),
  ];
  const byKey = new Map(cols.map((x) => [x.key, x]));

  it('per-sample columns: sample, variables, each population, derived', () => {
    expect(cols.map((x) => sectionOf(x, byKey))).toEqual(['sample', 'variables', 'pop:p1', 'derived']);
  });

  it('a summary column belongs to the section of the column it summarises; n has its own', () => {
    expect(sectionOf(c('dc_1:mean', 'aggregate', { source: 'dc_1' }), byKey)).toBe('derived');
    expect(sectionOf(c('var:dose:mean', 'aggregate', { source: 'var:dose' }), byKey)).toBe('variables');
    expect(sectionOf(c('p1|count:sd', 'aggregate', { source: 'p1|count', pop: 'p1' }), byKey)).toBe('pop:p1');
    expect(sectionOf(c('group:n', 'aggregate'), byKey)).toBe('group');
  });
});

describe('columns of a table CSV export', () => {
  const perSample: Table = {
    columns: [c('sample:name', 'sample'), c('var:dose', 'variable'), c('a', 'stat'), c('b', 'stat')],
    rows: [],
  };
  const grouped: Table = {
    columns: [
      c('var:dose', 'variable'),
      c('group:n', 'aggregate'),
      c('a:mean', 'aggregate', { source: 'a' }),
      c('a:sd', 'aggregate', { source: 'a' }),
      c('b:mean', 'aggregate', { source: 'b' }),
    ],
    rows: [],
  };

  it('all columns when none are picked', () => {
    expect(exportKeys(perSample, false, undefined)).toEqual(['sample:name', 'var:dose', 'a', 'b']);
  });

  it('only the picked columns of a per-sample table', () => {
    expect(exportKeys(perSample, false, ['sample:name', 'b'])).toEqual(['sample:name', 'b']);
    expect(exportKeys(perSample, false, [])).toEqual([]);
  });

  it('a grouped table keeps its grouping columns and n, and every summary of the picked columns', () => {
    expect(exportKeys(grouped, true, ['a'])).toEqual(['var:dose', 'group:n', 'a:mean', 'a:sd']);
    expect(exportKeys(grouped, true, [])).toEqual(['var:dose', 'group:n']);
  });
});
