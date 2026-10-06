import { readFileSync } from 'node:fs';
import { parseMatrixCsv } from '@flowmeris/compensation';
import { parseFcs } from '@flowmeris/fcs';
import { getBit, popcount } from '@flowmeris/gating';
import {
  type Gate,
  type Group,
  type Population,
  type Transform,
  newGroup,
  transformId,
} from '@flowmeris/model';
import { fixturePath, hasFixture, readFixture } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { Engine, MemoryStorage, sampleDataFromDataset } from './index.ts';
import type { AnalysisContext } from './types.ts';

function load(rel: string, sha: string) {
  const ds = parseFcs(readFixture(rel)).datasets[0]!;
  return sampleDataFromDataset(ds, sha.padEnd(64, '0'));
}

function truth(id: string): number[] {
  return readFileSync(fixturePath(`flowkit/gate_ref/truth/Results_${id}.txt`), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => (Number(l) ? 1 : 0));
}

function addGate(group: Group, gate: Gate, pops: Omit<Population, 'gate' | 'parent' | 'color'>[]) {
  group.template.gates[gate.id] = gate;
  for (const p of pops)
    group.template.populations[p.id] = { ...p, gate: gate.id, parent: gate.parentPop, color: '#2a78d6' };
}

describe('engine on data1.fcs vs Gating-ML truth', () => {
  const s = load('flowkit/gate_ref/data1.fcs', 'aa');
  const storage = new MemoryStorage();
  storage.put(s);
  const engine = new Engine(storage);
  const group = newGroup(
    'g',
    [s.sampleId],
    s.channels.map((c) => c.pnn),
  );
  const logicle: Transform = { kind: 'logicle', T: 10000, W: 0.5, M: 4.5, A: 0 };
  const tid = transformId(logicle);
  const ctx: AnalysisContext = { group, transforms: { [tid]: logicle }, compMatrices: {} };

  addGate(
    group,
    {
      id: 'g_poly1',
      parentPop: 'root',
      dims: [
        { channel: 'FL2-H', comp: 'group', transform: null },
        { channel: 'FL3-H', comp: 'group', transform: null },
      ],
      geometry: {
        kind: 'polygon',
        vertices: [
          [5, 5],
          [500, 5],
          [500, 500],
        ],
      },
    },
    [{ id: 'p_poly1', region: 'in', name: 'Polygon1' }],
  );
  addGate(
    group,
    {
      id: 'g_rect1',
      parentPop: 'root',
      dims: [
        { channel: 'SSC-H', comp: 'uncompensated', transform: null },
        { channel: 'FL1-H', comp: 'uncompensated', transform: null },
      ],
      geometry: { kind: 'rect', min: [20, 70], max: [80, 200] },
    },
    [{ id: 'p_rect1', region: 'in', name: 'Rectangle1' }],
  );
  addGate(
    group,
    {
      id: 'g_ell1',
      parentPop: 'root',
      dims: [
        { channel: 'FL3-H', comp: 'uncompensated', transform: null },
        { channel: 'FL4-H', comp: 'uncompensated', transform: null },
      ],
      geometry: {
        kind: 'ellipse',
        mean: [12.99701, 16.22941],
        cov: [
          [62.5, 37.5],
          [37.5, 62.5],
        ],
        d2: 1,
      },
    },
    [{ id: 'p_ell1', region: 'in', name: 'Ellipse1' }],
  );
  addGate(
    group,
    {
      id: 'g_quad1',
      parentPop: 'root',
      dims: [
        { channel: 'FL2-H', comp: 'group', transform: null },
        { channel: 'FL4-H', comp: 'group', transform: null },
      ],
      geometry: { kind: 'quadrant', center: [12.14748, 14.22417] },
    },
    [
      { id: 'p_q1', region: 'Q1', name: 'FL2N-FL4P' },
      { id: 'p_q2', region: 'Q2', name: 'FL2P-FL4P' },
      { id: 'p_q3', region: 'Q3', name: 'FL2P-FL4N' },
      { id: 'p_q4', region: 'Q4', name: 'FL2N-FL4N' },
    ],
  );

  it.each([
    ['p_poly1', 'Polygon1'],
    ['p_rect1', 'Rectangle1'],
    ['p_ell1', 'Ellipse1'],
    ['p_q1', 'FL2N-FL4P'],
    ['p_q2', 'FL2P-FL4P'],
    ['p_q3', 'FL2P-FL4N'],
    ['p_q4', 'FL2N-FL4N'],
  ])('%s matches Results_%s exactly', (pop, id) => {
    const bits = engine.popBits(ctx, s, pop);
    const t = truth(id);
    let bad = 0;
    for (let e = 0; e < t.length; e++) if ((getBit(bits, e) ? 1 : 0) !== t[e]) bad++;
    expect(bad).toBe(0);
  });

  it('quadrant regions sum to the parent', async () => {
    const c = await engine.counts(ctx, s.sampleId, ['p_q1', 'p_q2', 'p_q3', 'p_q4']);
    expect(c.reduce((a, x) => a + x.count, 0)).toBe(s.eventCount);
    expect(c[0]!.parentCount).toBe(s.eventCount);
    expect(c[0]!.grandparentCount).toBeNaN();
  });

  it('nested gates restrict to the parent and statistics use member events only', async () => {
    addGate(
      group,
      {
        id: 'g_child',
        parentPop: 'p_rect1',
        dims: [{ channel: 'FSC-H', comp: 'uncompensated', transform: tid }],
        geometry: { kind: 'rect', min: [0.2], max: [null] },
      },
      [{ id: 'p_child', region: 'in', name: 'child' }],
    );
    const [child] = await engine.counts(ctx, s.sampleId, ['p_child']);
    const parent = popcount(engine.popBits(ctx, s, 'p_rect1'));
    expect(child!.parentCount).toBe(parent);
    expect(child!.count).toBeLessThanOrEqual(parent);
    const [mean, pct] = await engine.stats(ctx, s.sampleId, [
      { id: 'st1', population: 'p_child', stat: 'mean', channel: 'FSC-H', space: 'linear' },
      { id: 'st2', population: 'p_child', stat: 'pctParent', space: 'linear' },
    ]);
    expect(mean!.n).toBe(child!.count);
    expect(pct!.value).toBeCloseTo((100 * child!.count) / parent, 12);
  });
});

describe('group application with per-sample overrides', () => {
  const files = [
    'remote/101_DEN084Y5_15_E01_008_clean.fcs',
    'remote/101_DEN084Y5_15_E03_009_clean.fcs',
    'remote/101_DEN084Y5_15_E05_010_clean.fcs',
  ];
  const run = files.every(hasFixture) ? it : it.skip;
  run('template applies to all samples; an override changes only its sample', async () => {
    const storage = new MemoryStorage();
    const samples = files.map((f, i) => load(f, `b${i}`));
    for (const s of samples) storage.put(s);
    const engine = new Engine(storage);
    const group = newGroup(
      '8-color',
      samples.map((s) => s.sampleId),
      samples[0]!.channels.map((c) => c.pnn),
    );
    const ctx: AnalysisContext = { group, transforms: {}, compMatrices: {} };
    addGate(
      group,
      {
        id: 'g_lymph',
        parentPop: 'root',
        dims: [
          { channel: 'FSC-A', comp: 'uncompensated', transform: null },
          { channel: 'SSC-A', comp: 'uncompensated', transform: null },
        ],
        geometry: { kind: 'rect', min: [50000, 0], max: [150000, 60000] },
      },
      [{ id: 'p_lymph', region: 'in', name: 'Lymphocytes' }],
    );
    const before = await Promise.all(samples.map((s) => engine.counts(ctx, s.sampleId, ['p_lymph'])));
    group.overrides.push({
      sampleId: samples[1]!.sampleId,
      gateId: 'g_lymph',
      geometry: { kind: 'rect', min: [60000, 0], max: [150000, 60000] },
      at: new Date().toISOString(),
    });
    const after = await Promise.all(samples.map((s) => engine.counts(ctx, s.sampleId, ['p_lymph'])));
    expect(after[0]![0]!.count).toBe(before[0]![0]!.count);
    expect(after[2]![0]!.count).toBe(before[2]![0]!.count);
    expect(after[1]![0]!.count).toBeLessThan(before[1]![0]!.count);
    // $SPILLOVER compensation resolves per sample
    expect(engine.compKey(ctx, samples[0]!)).not.toBe('none');
  });
});

describe('lazily loaded sample columns', () => {
  it('reads only the channels a computation needs and gives the eager results', async () => {
    const s = load('flowkit/test_comp_example.fcs', 'cc');
    const m = parseMatrixCsv(new TextDecoder().decode(readFixture('flowkit/comp_complete_example.csv')));
    const names = s.channels.map((c) => c.pnn);
    const plain = names.find((n) => !m.detectors.includes(n))!;
    const [d0, d1] = m.detectors as [string, string];
    const group = newGroup('g', [s.sampleId], names);
    group.compensation = { mode: 'matrix', matrixId: 'm1' };
    const ctx: AnalysisContext = {
      group,
      transforms: { lin: { kind: 'flin', T: 1e4, A: 0 } },
      compMatrices: { m1: { id: 'm1', name: 'm', source: { kind: 'manual' }, ...m } },
    };
    addGate(
      group,
      {
        id: 'g1',
        parentPop: 'root',
        dims: [{ channel: plain, comp: 'group', transform: null }],
        geometry: { kind: 'rect', min: [1], max: [null] },
      },
      [{ id: 'p1', region: 'in', name: 'p1' }],
    );
    const loaded: number[] = [];
    const lazy = new Engine({
      async loadSample() {
        return {
          ...s,
          columns: s.columns.map(() => null),
          loadColumn: async (ci: number) => {
            loaded.push(ci);
            return s.columns[ci]!;
          },
        };
      },
    });
    const eagerStorage = new MemoryStorage();
    eagerStorage.put(s);
    const eager = new Engine(eagerStorage);

    // A channel outside the matrix needs only itself, even when compensated.
    const [a] = await lazy.counts(ctx, s.sampleId, ['p1']);
    const [b] = await eager.counts(ctx, s.sampleId, ['p1']);
    expect(a).toEqual(b);
    expect(loaded).toEqual([names.indexOf(plain)]);

    // A compensated matrix channel needs every detector of the matrix, each read once.
    const axis = (channel: string) => ({
      channel,
      comp: 'group' as const,
      transform: 'lin',
      range: [0, 1] as [number, number],
    });
    const style = { histBins: 64, histNorm: 'count', histSmooth: false } as const;
    const ha = await lazy.histogram(ctx, s.sampleId, 'p1', axis(d0), style);
    const hb = await eager.histogram(ctx, s.sampleId, 'p1', axis(d0), style);
    expect(Array.from(ha.heights)).toEqual(Array.from(hb.heights));
    expect(new Set(loaded)).toEqual(new Set([plain, ...m.detectors].map((n) => names.indexOf(n))));
    await lazy.histogram(ctx, s.sampleId, 'p1', axis(d1), style);
    expect(loaded.length).toBe(new Set(loaded).size);
  });
});
