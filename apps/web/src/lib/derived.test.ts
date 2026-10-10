import type { DerivedColumn, Variable } from '@flowmeris/model';
import type { ColumnDef } from '@flowmeris/table';
import { describe, expect, it } from 'vitest';
import { columnsBefore, defaultNormalizeSource, derivedSummary, normalizeAutoName } from './derived.ts';

const col = (key: string, kind: ColumnDef['kind'], label = key): ColumnDef => ({
  key,
  label,
  kind,
  type: 'numeric',
});
const variables = [
  { id: 'v1', name: 'Dose' },
  { id: 'v2', name: 'Rep' },
] as Variable[];
type Normalize = Extract<DerivedColumn, { kind: 'normalize' }>;
const norm = (more: Partial<Normalize>): Normalize => ({
  id: 'n',
  name: '',
  kind: 'normalize',
  source: 'st_1',
  refVariable: 'v1',
  refValue: 0,
  within: [],
  mode: 'ratio',
  ...more,
});

describe('normalization defaults', () => {
  it('starts from the last value statistic or derived column, else the last frequency', () => {
    expect(defaultNormalizeSource([col('st_1', 'stat'), col('p|count', 'stat'), col('st_2', 'stat')])).toBe(
      'st_2',
    );
    expect(defaultNormalizeSource([col('st_1', 'stat'), col('p|pctParent', 'stat')])).toBe('st_1');
    expect(defaultNormalizeSource([col('p|count', 'stat'), col('p|pctParent', 'stat')])).toBe('p|pctParent');
    expect(defaultNormalizeSource([col('var:v1', 'variable')])).toBe('');
  });

  it('is named after the statistic and the reference', () => {
    const cols = [col('st_1', 'stat', 'CD4+ | Median PE-A')];
    expect(normalizeAutoName(norm({}), cols, variables)).toBe('Median PE-A / Dose 0');
    expect(normalizeAutoName(norm({ mode: 'percent' }), cols, variables)).toBe('Median PE-A % of Dose 0');
    expect(normalizeAutoName(norm({ mode: 'difference', source: 'x' }), cols, variables)).toBe('? − Dose 0');
  });
});

describe('derived column list', () => {
  it('describes formulas and normalizations', () => {
    expect(derivedSummary({ id: 'f', name: 'F', kind: 'formula', expr: '[a] / [b]' }, variables)).toBe(
      '= [a] / [b]',
    );
    expect(derivedSummary(norm({ within: ['v2', 'gone'] }), variables)).toBe(
      'ratio to Dose = 0 within Rep, ?',
    );
  });

  it('lets a derived column use only the columns before it', () => {
    const cols = [col('st_1', 'stat'), col('derived:a', 'derived'), col('derived:b', 'derived')];
    expect(columnsBefore(cols, 'b').map((c) => c.key)).toEqual(['st_1', 'derived:a']);
    expect(columnsBefore(cols)).toBe(cols);
    expect(columnsBefore(cols, 'new')).toBe(cols);
  });
});
