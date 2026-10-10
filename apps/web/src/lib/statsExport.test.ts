import { newGroup, newWorkspace } from '@flowmeris/model';
import type { ColumnDef, Table } from '@flowmeris/table';
import { describe, expect, it } from 'vitest';
import {
  distinctValues,
  eventsFileName,
  exportColumnSections,
  gatingMlFiles,
  statsCsvName,
  toggleExportColumns,
} from './statsExport.ts';

const col = (key: string, kind: ColumnDef['kind'], pop?: string): ColumnDef => ({
  key,
  label: key,
  kind,
  type: 'numeric',
  ...(pop ? { pop } : {}),
});

describe('statistics export files', () => {
  it('are named after the group, safely', () => {
    expect(statsCsvName('My group/1', 'tidy')).toBe('My_group_1_statistics_tidy.csv');
    expect(eventsFileName('a b.fcs', 'CD4+', 'csv')).toBe('a_b_CD4.csv');
    expect(eventsFileName('x.lmd', undefined, 'fcs')).toBe('x_population.fcs');
  });

  it('Gating-ML: the template, then the effective gates of each overridden sample once', () => {
    const ws = newWorkspace('W', { version: '0', commit: '', kernels: '' });
    const g = newGroup('G 1', ['s1', 's2'], ['FSC-A']);
    ws.samples.s2 = { fileName: 'b.fcs' } as (typeof ws.samples)[string];
    g.overrides = [
      { gateId: 'a', sampleId: 's2', geometry: { kind: 'rect', min: [0], max: [1] }, at: '' },
      { gateId: 'b', sampleId: 's2', geometry: { kind: 'rect', min: [0], max: [1] }, at: '' },
    ];
    const files = gatingMlFiles(ws, g, '1.0');
    expect(files.map((f) => f.name)).toEqual([
      'G_1_template.gating-ml.xml',
      'G_1_b.fcs_effective.gating-ml.xml',
    ]);
    expect(files[0]!.xml).toContain('gating:Gating-ML');
  });
});

describe('variable values', () => {
  it('are distinct, numbers ascending and text in natural order, without blanks', () => {
    const rows = [5, 'b10', 1, 'b2', '', undefined, 5, 10].map((v, i) => ({
      id: `r${i}`,
      values: { 'var:v': v },
    }));
    expect(distinctValues(rows, 'v')).toEqual([1, 5, 10, 'b2', 'b10']);
  });
});

describe('export column checklist', () => {
  const g = newGroup('G', [], []);
  g.template.populations.p = {
    id: 'p',
    parent: 'root',
    gate: 'x',
    region: 'in',
    name: 'Cells',
    color: '#000',
  };
  const table: Table = {
    columns: [
      col('sample:name', 'sample'),
      col('var:a', 'variable'),
      col('var:b', 'variable'),
      col('p|count', 'stat', 'p'),
      col('st_1', 'stat', 'p'),
      col('derived:d', 'derived'),
    ],
    rows: [],
  };

  it('groups the columns by section', () => {
    expect(exportColumnSections(table, g).map((s) => [s.title, s.cols.length])).toEqual([
      ['Sample', 1],
      ['Variables', 2],
      ['Cells', 2],
      ['Derived', 1],
    ]);
  });

  it('turns columns on and off, back to "all" when every one is on', () => {
    const off = toggleExportColumns(table, undefined, ['var:a', 'var:b'], false);
    expect(off).toEqual(['sample:name', 'p|count', 'st_1', 'derived:d']);
    expect(toggleExportColumns(table, off, ['var:b'], true)).toEqual([
      'sample:name',
      'var:b',
      'p|count',
      'st_1',
      'derived:d',
    ]);
    expect(toggleExportColumns(table, off, ['var:a', 'var:b'], true)).toBeUndefined();
  });
});
