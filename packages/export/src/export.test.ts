import { Engine, MemoryStorage, sampleDataFromDataset, sampleMetaFromDataset } from '@flowmeris/engine';
import { linearize, parseFcs } from '@flowmeris/fcs';
import { getBit } from '@flowmeris/gating';
import { evaluateGatingML, parseGatingML } from '@flowmeris/gatingml';
import { type Gate, type Transform, newGroup, newWorkspace, transformId } from '@flowmeris/model';
import { readFixture } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { type StatCell, csvField, exportGatingML, tidyRows, toCsv, wideRows } from './index.ts';

const bytes = readFixture('flowkit/gate_ref/data1.fcs');
const ds = parseFcs(bytes).datasets[0]!;
const sha = 'c'.repeat(64);
const data = sampleDataFromDataset(ds, sha);

function setup() {
  const ws = newWorkspace('ws', { version: 'test', commit: 'x', kernels: 'ts-1' });
  const meta = sampleMetaFromDataset(ds, {
    name: 'data1.fcs',
    relativePath: 'f/data1.fcs',
    size: bytes.length,
    sha256: sha,
  });
  ws.samples[meta.id] = meta;
  const g = newGroup(
    'g',
    [meta.id],
    meta.channels.map((c) => c.pnn),
  );
  ws.groups.push(g);
  const lg: Transform = { kind: 'logicle', T: 1024, W: 0.5, M: 4.5, A: 0 };
  const tid = transformId(lg);
  ws.transforms[tid] = lg;
  const add = (gate: Gate, regions: ('in' | 'Q1' | 'Q2' | 'Q3' | 'Q4')[]) => {
    g.template.gates[gate.id] = gate;
    for (const r of regions)
      g.template.populations[`${gate.id}_${r}`] = {
        id: `${gate.id}_${r}`,
        parent: gate.parentPop,
        gate: gate.id,
        region: r,
        name: `${gate.id} ${r}`,
        color: '#000',
      };
  };
  const d = (channel: string, transform: string | null = tid) => ({
    channel,
    comp: 'group' as const,
    transform,
  });
  add(
    {
      id: 'rect',
      parentPop: 'root',
      dims: [d('FSC-H'), d('SSC-H')],
      geometry: { kind: 'rect', min: [0.2, 0.1], max: [0.9, null] },
    },
    ['in'],
  );
  add(
    {
      id: 'poly',
      parentPop: 'rect_in',
      dims: [d('FL1-H'), d('FL2-H')],
      geometry: {
        kind: 'polygon',
        vertices: [
          [0.1, 0.1],
          [0.8, 0.2],
          [0.5, 0.9],
        ],
      },
    },
    ['in'],
  );
  add(
    {
      id: 'ell',
      parentPop: 'root',
      dims: [d('FL3-H', null), d('FL4-H', null)],
      geometry: {
        kind: 'ellipse',
        mean: [13, 16],
        cov: [
          [62.5, 37.5],
          [37.5, 62.5],
        ],
        d2: 1,
      },
    },
    ['in'],
  );
  add(
    {
      id: 'quad',
      parentPop: 'rect_in',
      dims: [d('FL1-H'), d('FL4-H')],
      geometry: { kind: 'quadrant', center: [0.4, 0.45] },
    },
    ['Q1', 'Q2', 'Q3', 'Q4'],
  );
  add(
    {
      id: 'spi',
      parentPop: 'root',
      dims: [d('FL2-H'), d('FL3-H')],
      geometry: {
        kind: 'spider',
        center: [0.4, 0.4],
        arms: [
          [0.45, 0.8],
          [0.8, 0.5],
          [0.35, 0.1],
          [0.1, 0.3],
        ],
      },
    },
    ['Q1', 'Q2', 'Q3', 'Q4'],
  );
  return { ws, g, sampleId: meta.id };
}

describe('M-EXPORT-GML: Gating-ML export round trip', () => {
  it('exported gates evaluate to the same membership as the engine', () => {
    const { ws, g, sampleId } = setup();
    const xml = exportGatingML(ws, g, { appVersion: 'test' });
    const doc = parseGatingML(xml);
    const res = evaluateGatingML(doc, {
      channels: ds.channels.map((c) => c.pnn),
      columns: ds.channels.map((c, i) => linearize(ds.columns[i]!, c.scaling)),
      keywords: ds.keywords,
      eventCount: ds.eventCount,
    });
    const storage = new MemoryStorage();
    storage.put(data);
    const engine = new Engine(storage);
    const ctx = { group: g, transforms: ws.transforms, compMatrices: ws.compMatrices };
    for (const popId of Object.keys(g.template.populations)) {
      if (popId === 'root') continue;
      const bits = engine.popBits(ctx, data, popId);
      const gm = res.get(popId);
      expect(gm, popId).toBeDefined();
      let bad = 0;
      for (let e = 0; e < ds.eventCount; e++) if ((getBit(bits, e) ? 1 : 0) !== gm![e]) bad++;
      expect(bad, popId).toBe(0);
    }
    expect(sampleId).toBeTruthy();
  });
});

describe('M-EXPORT-STATS', () => {
  it('quotes CSV fields per RFC 4180', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(Number.NaN)).toBe('NaN');
    expect(toCsv([[1, 'x']])).toBe('1,x\r\n');
  });
  it('tidy rows carry provenance and flag overridden paths', () => {
    const { ws, g, sampleId } = setup();
    g.overrides.push({
      sampleId,
      gateId: 'rect',
      geometry: { kind: 'rect', min: [0.3, 0.1], max: [0.9, null] },
      at: 'now',
    });
    const cells: StatCell[] = [
      {
        sampleId,
        population: 'poly_in',
        statistic: 'median',
        channel: 'FL1-H',
        space: 'linear',
        value: 12.5,
        n: 10,
        nExcluded: 0,
      },
    ];
    const rows = tidyRows(ws, g, cells, '0.1.0');
    expect(rows.length).toBe(2);
    const header = rows[0] as string[];
    const r = rows[1]!;
    expect(r[header.indexOf('population_path')]).toBe('All events/rect in/poly in');
    expect(r[header.indexOf('gate_overridden_on_path')]).toBe(true);
    expect(r[header.indexOf('overridden_gate_ids')]).toBe('rect');
    expect(r[header.indexOf('sample_sha256')]).toBe(sha);
    const wide = wideRows(ws, g, cells);
    expect(wide[1]![2]).toBe(12.5);
  });
  it('includes sample variables after the sample identity columns', () => {
    const { ws, g, sampleId } = setup();
    ws.variables.push({ id: 'v1', name: 'Dose', unit: 'nM', type: 'numeric', levels: [] });
    ws.variables.push({ id: 'v2', name: 'value', type: 'categorical', levels: [] });
    ws.samples[sampleId]!.meta = { v1: 10, v2: 'ctl' };
    const cells: StatCell[] = [
      { sampleId, population: 'root', statistic: 'count', space: 'n/a', value: 5, n: 5, nExcluded: 0 },
    ];
    const tidy = tidyRows(ws, g, cells, '0.1.0');
    const h = tidy[0] as string[];
    expect(h.slice(h.indexOf('dataset') + 1, h.indexOf('dataset') + 3)).toEqual(['Dose (nM)', 'value (2)']);
    expect(tidy[1]![h.indexOf('Dose (nM)')]).toBe(10);
    expect(tidy[1]![h.indexOf('value')]).toBe(5);
    const wide = wideRows(ws, g, cells);
    expect(wide[0]!.slice(0, 4)).toEqual(['sample_file', 'sample_sha256', 'Dose (nM)', 'value']);
    expect(wide[1]!.slice(2)).toEqual([10, 'ctl', 5]);
  });
});
