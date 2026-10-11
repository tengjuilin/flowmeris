import { type Group, type Population, type Sample, type StatSpec, newGroup } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { baseTable, sampleKeys, statColumns, toTable } from './statsTable.ts';

const pop = (id: string, name: string, parent = 'root'): Population => ({
  id,
  parent,
  gate: 'gate_a',
  region: 'in',
  name,
  color: '#000000',
});

function group(): Group {
  const g = newGroup('G', ['s1', 's2'], ['FSC-A', 'FL1-A']);
  g.template.gates.gate_a = {
    id: 'gate_a',
    parentPop: 'root',
    dims: [{ channel: 'FSC-A', comp: 'group', transform: null }],
    geometry: { kind: 'rect', min: [0], max: [10] },
  } as Group['template']['gates'][string];
  g.template.populations.pop_a = pop('pop_a', 'Cells');
  return g;
}

const mean: StatSpec = { id: 'st_1', population: 'pop_a', stat: 'mean', channel: 'FL1-A', space: 'linear' };

describe('per-sample dependency keys', () => {
  it('differ only for the sample that has an override', () => {
    const g = group();
    const pops = Object.values(g.template.populations);
    const before = sampleKeys(g, pops, {}, {}, ['s1', 's2']);
    g.overrides.push({
      gateId: 'gate_a',
      sampleId: 's2',
      geometry: { kind: 'rect', min: [1], max: [9] },
      at: '',
    });
    const after = sampleKeys(g, pops, {}, {}, ['s1', 's2']);
    expect(after.get('s1')).toBe(before.get('s1'));
    expect(after.get('s2')).not.toBe(before.get('s2'));
  });

  it('ignore population names and colors', () => {
    const g = group();
    const key = () => sampleKeys(g, Object.values(g.template.populations), {}, {}, ['s1']).get('s1');
    const k0 = key();
    g.template.populations.pop_a!.name = 'Renamed';
    g.template.populations.pop_a!.color = '#ffffff';
    expect(key()).toBe(k0);
  });

  it('change with the requested statistics', () => {
    const g = group();
    const key = () => sampleKeys(g, Object.values(g.template.populations), {}, {}, ['s1']).get('s1');
    const k0 = key();
    g.stats.push(mean);
    expect(key()).not.toBe(k0);
  });
});

describe('a sample’s results as a table row', () => {
  const counts = [
    { popId: 'root', count: 200, parentCount: 200, grandparentCount: 200, totalCount: 200 },
    { popId: 'pop_a', count: 50, parentCount: 200, grandparentCount: 200, totalCount: 200 },
    { popId: 'pop_b', count: 0, parentCount: 0, grandparentCount: 50, totalCount: 200 },
  ];
  const t = toTable(
    's1',
    counts,
    [{ statId: 'st_1', sampleId: 's1', value: 3.5, n: 50, nExcluded: 2 }],
    [mean],
  );

  it('has counts, % parent (not for the root) and statistics by column key', () => {
    expect(t.values.get('root|count')).toBe(200);
    expect(t.values.has('root|pctParent')).toBe(false);
    expect(t.values.get('pop_a|pctParent')).toBe(25);
    expect(t.values.get('pop_b|pctParent')).toBeNaN();
    expect(t.values.get('st_1')).toBe(3.5);
  });

  it('has export cells with provenance', () => {
    expect(t.cells.find((c) => c.statistic === 'mean')).toEqual({
      sampleId: 's1',
      population: 'pop_a',
      statistic: 'mean',
      channel: 'FL1-A',
      space: 'linear',
      value: 3.5,
      n: 50,
      nExcluded: 2,
    });
    expect(t.cells.filter((c) => c.statistic === 'count').every((c) => c.space === 'n/a')).toBe(true);
  });
});

describe('statistic columns and the base table', () => {
  it('list each population’s count, % parent and statistics in population order', () => {
    const g = group();
    g.stats.push(mean);
    const pops = [g.template.populations.root!, g.template.populations.pop_a!];
    const cols = statColumns(g, pops, (c) => (c === 'FL1-A' ? 'GFP' : undefined));
    expect(cols.map((c) => c.key)).toEqual(['root|count', 'pop_a|count', 'pop_a|pctParent', 'st_1']);
    expect(cols[3]!.specId).toBe('st_1');
  });

  it('labels statistics by population, by path when a name repeats', () => {
    const g = group();
    g.template.populations.pop_b = pop('pop_b', 'Cells', 'pop_a');
    const pops = [g.template.populations.pop_a!, g.template.populations.pop_b!];
    const cols = statColumns(g, pops, () => undefined);
    const samples = { s1: { fileName: 's1.fcs', well: 'A1', meta: { var_d: 2 } } } as unknown as Record<
      string,
      Sample
    >;
    const variables = [{ id: 'var_d', name: 'Dose', type: 'numeric' as const, unit: 'nM', levels: [] }];
    const t = baseTable(g, cols, [{ sid: 's1', table: undefined, stale: true }], samples, variables, {});
    expect(t.columns.map((c) => c.label)).toEqual([
      'Sample',
      'Well',
      'Dose (nM)',
      'All events/Cells | Count',
      'All events/Cells | % Parent',
      'All events/Cells/Cells | Count',
      'All events/Cells/Cells | % Parent',
    ]);
    expect(t.rows[0]!.values).toEqual({ 'sample:name': 's1.fcs', 'sample:well': 'A1', 'var:var_d': 2 });
  });
});
