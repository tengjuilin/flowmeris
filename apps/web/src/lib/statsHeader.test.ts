import type { DerivedColumn } from '@flowmeris/model';
import type { ColumnDef, Table } from '@flowmeris/table';
import { describe, expect, it } from 'vitest';
import { fracLengths, headerSections, pinnedCount, sectionStarts, sigOf, statOf } from './statsHeader.ts';
import type { StatColumn } from './statsTable.ts';

const col = (key: string, kind: ColumnDef['kind'], more: Partial<ColumnDef> = {}): ColumnDef => ({
  key,
  label: key,
  kind,
  type: 'numeric',
  ...more,
});

const perSample = [
  col('sample:name', 'sample', { type: 'categorical' }),
  col('var:dose', 'variable'),
  col('p|count', 'stat', { pop: 'p' }),
  col('st_1', 'stat', { pop: 'p' }),
  col('derived:d', 'derived'),
];
const byKey = new Map(perSample.map((c) => [c.key, c]));
const grouped = [
  col('var:dose', 'variable'),
  col('group:n', 'aggregate', { func: 'n' }),
  col('agg:st_1:mean', 'aggregate', { source: 'st_1', func: 'mean' }),
  col('agg:st_1:sd', 'aggregate', { source: 'st_1', func: 'sd' }),
  col('agg:derived:d:mean', 'aggregate', { source: 'derived:d', func: 'mean' }),
];

describe('statistics table header', () => {
  it('runs of sections, with a divider at the start of each after the first', () => {
    const s = headerSections(perSample, byKey);
    expect(s).toEqual([
      { id: 'sample', span: 1 },
      { id: 'variables', span: 1 },
      { id: 'pop:p', span: 2 },
      { id: 'derived', span: 1 },
    ]);
    expect([...sectionStarts(perSample, s, false)]).toEqual(['var:dose', 'p|count', 'derived:d']);
  });

  it('a grouped table also divides the summaries of different columns', () => {
    const s = headerSections(grouped, byKey);
    expect([...sectionStarts(grouped, s, true)].sort()).toEqual([
      'agg:derived:d:mean',
      'agg:st_1:mean',
      'group:n',
    ]);
  });

  it('pins the sample name, or the grouping columns', () => {
    expect(pinnedCount(perSample, false)).toBe(1);
    expect(pinnedCount(grouped, true)).toBe(1);
    expect(pinnedCount([col('var:a', 'variable'), col('var:b', 'variable'), ...grouped.slice(1)], true)).toBe(
      2,
    );
  });
});

describe('statistics table numbers', () => {
  const statByKey = new Map<string, StatColumn>([['st_1', { key: 'st_1', stat: 'median' } as StatColumn]]);
  const derived = new Map<string, DerivedColumn>([
    ['d', { id: 'd', name: 'D', kind: 'formula', expr: '1', sigFigs: 5 }],
  ]);

  it('format as their statistic: n, CV, variables as entered, else the source column', () => {
    expect(statOf(grouped[1]!, statByKey)).toBe('n');
    expect(statOf(col('x', 'aggregate', { func: 'cv', source: 'st_1' }), statByKey)).toBe('cv');
    expect(statOf(perSample[1]!, statByKey)).toBe('value');
    expect(statOf(grouped[2]!, statByKey)).toBe('median');
  });

  it('derived columns and summaries of variables have significant figures', () => {
    expect(sigOf(perSample[4]!, byKey, derived)).toBe(5);
    expect(sigOf(grouped[4]!, byKey, derived)).toBe(5);
    expect(sigOf(col('derived:gone', 'derived'), byKey, derived)).toBe(3);
    expect(sigOf(col('agg:var:dose:mean', 'aggregate', { source: 'var:dose' }), byKey, derived)).toBe(3);
    expect(sigOf(perSample[3]!, byKey, derived)).toBeUndefined();
  });

  it('measures the longest fractional part of each numeric column', () => {
    const t: Table = {
      columns: [perSample[0]!, col('a', 'derived'), col('b', 'derived')],
      rows: [
        { id: 'r1', values: { a: 1.5, b: 2 } },
        { id: 'r2', values: { a: 0.125, b: 'x' } },
      ],
    };
    expect([...fracLengths(t, (_c, v) => String(v))]).toEqual([
      ['a', 3],
      ['b', 0],
    ]);
  });
});
