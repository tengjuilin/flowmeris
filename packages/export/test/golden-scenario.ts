/**
 * Workspaces shared by the golden inputs (Gating-ML and FCS files the app writes, committed under
 * fixtures/golden/inputs and evaluated by FlowKit in tools/golden/python/generate.py) and the parity
 * tests that check the engine against FlowKit's results for them.
 *
 * Changing a scenario changes the inputs: run `corepack pnpm golden` to rewrite and re-evaluate them.
 */
import { createHash } from 'node:crypto';
import { parseMatrixCsv } from '@flowmeris/compensation';
import {
  type AnalysisContext,
  Engine,
  MemoryStorage,
  type SampleData,
  sampleDataFromDataset,
  sampleMetaFromDataset,
} from '@flowmeris/engine';
import { type FcsDataset, parseFcs } from '@flowmeris/fcs';
import {
  type CompRef,
  type Gate,
  type Group,
  type Region,
  type Transform,
  type Workspace,
  newGroup,
  newWorkspace,
  populationPath,
  transformId,
} from '@flowmeris/model';
import { hasFixture, readFixture } from '@flowmeris/testkit';
import { exportGatingML } from '../src/index.ts';

export type ScenarioName = 'data1' | 'comp_kw' | 'comp_csv';

export interface FcsExport {
  pop: string;
  mode: 'raw' | 'compensated';
}

export interface Scenario {
  name: ScenarioName;
  /** FCS file, relative to fixtures/. */
  file: string;
  /** Compensation as FlowKit should apply it for statistics. */
  compensation: { kind: 'none' } | { kind: 'keyword' } | { kind: 'csv'; path: string };
  ws: Workspace;
  group: Group;
  sampleId: string;
  ds: FcsDataset;
  data: SampleData;
  /** Transform ids, in order: statistics are computed in linear space and in each of these. */
  statTransforms: string[];
  fcsExports: FcsExport[];
}

const APP = { version: 'golden', commit: 'golden', kernels: 'ts-1' };
const SRC_DIR = 'golden/inputs';

/** Fixed provenance keywords, so exported FCS files are byte-stable. */
export function provenance(sc: Scenario, e: FcsExport): Record<string, string> {
  return {
    FLOWMERIS_VERSION: 'golden',
    FLOWMERIS_SRC_SHA256: sc.data.sha256,
    FLOWMERIS_SRC_FILE: sc.file.split('/').pop()!,
    FLOWMERIS_POPULATION: populationPath(sc.group.template, e.pop),
    FLOWMERIS_VALUES: e.mode === 'raw' ? 'linearised, uncompensated' : 'linearised, compensated',
  };
}

export const inputPath = {
  gml: (sc: Scenario) => `${SRC_DIR}/${sc.name}.gml.xml`,
  manifest: (sc: Scenario) => `${SRC_DIR}/${sc.name}.json`,
  fcs: (sc: Scenario, e: FcsExport) => `${SRC_DIR}/${sc.name}_${e.pop}_${e.mode}.fcs`,
};

function base(name: ScenarioName, file: string, groupName: string) {
  const bytes = readFixture(file);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const ds = parseFcs(bytes).datasets[0]!;
  const ws = newWorkspace(name, APP);
  // Fixed ids and times keep the exported files byte-stable.
  ws.id = `ws_${name}`;
  ws.createdAt = ws.modifiedAt = '2026-01-01T00:00:00.000Z';
  const meta = sampleMetaFromDataset(ds, {
    name: file.split('/').pop()!,
    relativePath: file,
    size: bytes.length,
    sha256: sha,
  });
  ws.samples[meta.id] = meta;
  const group = newGroup(
    groupName,
    [meta.id],
    meta.channels.map((c) => c.pnn),
  );
  group.id = `grp_${name}`;
  ws.groups.push(group);
  const tr = (t: Transform) => {
    const id = transformId(t);
    ws.transforms[id] = t;
    return id;
  };
  const add = (gate: Gate, regions: Region[], names: Partial<Record<Region, string>> = {}) => {
    group.template.gates[gate.id] = gate;
    for (const r of regions)
      group.template.populations[`${gate.id}_${r}`] = {
        id: `${gate.id}_${r}`,
        parent: gate.parentPop,
        gate: gate.id,
        region: r,
        name: names[r] ?? `${gate.id} ${r}`,
        color: '#000',
      };
  };
  const dim = (channel: string, transform: string | null, comp: CompRef = 'group') => ({
    channel,
    comp,
    transform,
  });
  return { ws, group, ds, data: sampleDataFromDataset(ds, sha), sampleId: meta.id, tr, add, dim };
}

/**
 * data1.fcs (no compensation): every gate kind, on linear, flin, logicle, arcsinh and hyperlog
 * dimensions, five levels deep, with integer-valued ties on gate boundaries (FL2-A).
 */
function data1(): Scenario {
  const b = base('data1', 'flowkit/gate_ref/data1.fcs', 'data1 gates');
  const { add, dim, tr } = b;
  b.group.compensation = { mode: 'none' };
  const lg = tr({ kind: 'logicle', T: 1024, W: 0.5, M: 4.5, A: 0 });
  const as = tr({ kind: 'fasinh', T: 1024, M: 4, A: 0 });
  const hl = tr({ kind: 'hyperlog', T: 1024, W: 0.5, M: 4.5, A: 0 });
  const ln = tr({ kind: 'flin', T: 1024, A: 0 });
  const lo = tr({ kind: 'flog', T: 1024, M: 4.5 });
  add(
    {
      id: 'cells',
      parentPop: 'root',
      dims: [dim('FSC-H', null), dim('SSC-H', null)],
      geometry: { kind: 'rect', min: [40, 8], max: [250, null] },
    },
    ['in'],
    { in: 'Cells' },
  );
  add(
    {
      id: 'lymph',
      parentPop: 'cells_in',
      dims: [dim('FSC-H', lg), dim('SSC-H', lg)],
      geometry: {
        kind: 'polygon',
        vertices: [
          [0.7, 0.58],
          [0.78, 0.58],
          [0.78, 0.68],
          [0.72, 0.7],
          [0.69, 0.64],
        ],
      },
    },
    ['in'],
    { in: 'Lymphocytes' },
  );
  add(
    {
      id: 'cd3',
      parentPop: 'lymph_in',
      dims: [dim('FL3-H', as)],
      geometry: { kind: 'rect', min: [0.4], max: [0.9] },
    },
    ['in'],
    { in: 'CD3+' },
  );
  add(
    {
      id: 't48',
      parentPop: 'cd3_in',
      dims: [dim('FL1-H', lg), dim('FL4-H', lg)],
      geometry: { kind: 'quadrant', center: [0.55, 0.47] },
    },
    ['Q1', 'Q2', 'Q3', 'Q4'],
    { Q2: 'CD4+ & CD8+ <double>' },
  );
  add(
    {
      id: 'deep',
      parentPop: 't48_Q2',
      dims: [dim('FL2-H', lg)],
      geometry: { kind: 'split', at: 0.6 },
    },
    ['lo', 'hi'],
  );
  add(
    {
      id: 'spi',
      parentPop: 'cells_in',
      dims: [dim('FL1-H', hl), dim('FL2-H', hl)],
      geometry: {
        kind: 'spider',
        center: [0.5, 0.55],
        arms: [
          [0.52, 0.8],
          [0.8, 0.57],
          [0.48, 0.3],
          [0.2, 0.53],
        ],
      },
    },
    ['Q1', 'Q2', 'Q3', 'Q4'],
  );
  // Bisector at an integer value of an integer-valued channel: ties go to 'hi'.
  add({ id: 'bis', parentPop: 'root', dims: [dim('FL2-A', null)], geometry: { kind: 'split', at: 3 } }, [
    'lo',
    'hi',
  ]);
  // Histogram range with ties on both bounds: min inclusive, max exclusive.
  add(
    {
      id: 'ties',
      parentPop: 'root',
      dims: [dim('FL2-A', null)],
      geometry: { kind: 'rect', min: [1], max: [3] },
    },
    ['in'],
  );
  add(
    {
      id: 'ell',
      parentPop: 'root',
      dims: [dim('FL3-H', null), dim('FL4-H', null)],
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
      id: 'ellt',
      parentPop: 'cells_in',
      dims: [dim('FL1-H', lg), dim('FL2-H', lg)],
      geometry: {
        kind: 'ellipse',
        mean: [0.55, 0.59],
        cov: [
          [0.004, 0.001],
          [0.001, 0.003],
        ],
        d2: 4,
      },
    },
    ['in'],
  );
  // Self-intersecting (bow-tie) polygon.
  add(
    {
      id: 'bowtie',
      parentPop: 'root',
      dims: [dim('FL1-H', lg), dim('FL2-H', lg)],
      geometry: {
        kind: 'polygon',
        vertices: [
          [0.4, 0.4],
          [0.7, 0.7],
          [0.7, 0.4],
          [0.4, 0.7],
        ],
      },
    },
    ['in'],
  );
  add(
    {
      id: 'time',
      parentPop: 'root',
      dims: [dim('Time', ln)],
      geometry: { kind: 'rect', min: [0.05], max: [0.12] },
    },
    ['in'],
  );
  return {
    name: 'data1',
    file: 'flowkit/gate_ref/data1.fcs',
    compensation: { kind: 'none' },
    ...pick(b),
    statTransforms: [lg, as, hl, ln, lo],
    fcsExports: [{ pop: 't48_Q2', mode: 'raw' }],
  };
}

/** 100715.fcs: 13-colour $SPILLOVER compensation from the file's keyword. */
function compKw(): Scenario {
  const file = 'flowio/100715.fcs';
  const b = base('comp_kw', file, 'keyword compensation');
  const { add, dim, tr } = b;
  b.group.compensation = { mode: 'per-sample-keyword' };
  const lg = tr({ kind: 'logicle', T: 262144, W: 0.5, M: 4.5, A: 0 });
  const as = tr({ kind: 'fasinh', T: 262144, M: 4.5, A: 0 });
  // Statistics only: log of compensated values, whose non-positive values are excluded (M-TR-LOGNP).
  const lo = tr({ kind: 'flog', T: 262144, M: 4.5 });
  add(
    {
      id: 'scat',
      parentPop: 'root',
      dims: [dim('FSC-A', null), dim('SSC-A', null)],
      geometry: { kind: 'rect', min: [30000, 50], max: [200000, 2000] },
    },
    ['in'],
  );
  add(
    {
      id: 'cd3',
      parentPop: 'scat_in',
      dims: [dim('R780-A', lg)],
      geometry: { kind: 'rect', min: [0.3], max: [null] },
    },
    ['in'],
  );
  // The same range on uncompensated values.
  add(
    {
      id: 'cd3raw',
      parentPop: 'scat_in',
      dims: [dim('R780-A', lg, 'uncompensated')],
      geometry: { kind: 'rect', min: [0.3], max: [null] },
    },
    ['in'],
  );
  add(
    {
      id: 'cd48',
      parentPop: 'cd3_in',
      dims: [dim('V655-A', lg), dim('V800-A', lg)],
      geometry: { kind: 'quadrant', center: [0.45, 0.45] },
    },
    ['Q1', 'Q2', 'Q3', 'Q4'],
  );
  add(
    {
      id: 'poly',
      parentPop: 'scat_in',
      dims: [dim('B515-A', lg), dim('G560-A', as)],
      geometry: {
        kind: 'polygon',
        vertices: [
          [0.45, 0.3],
          [0.62, 0.35],
          [0.6, 0.6],
          [0.42, 0.55],
        ],
      },
    },
    ['in'],
  );
  add(
    { id: 'cd27', parentPop: 'scat_in', dims: [dim('G660-A', lg)], geometry: { kind: 'split', at: 0.27 } },
    ['lo', 'hi'],
  );
  return {
    name: 'comp_kw',
    file,
    compensation: { kind: 'keyword' },
    ...pick(b),
    statTransforms: [lg, as, lo],
    fcsExports: [
      { pop: 'cd48_Q3', mode: 'compensated' },
      { pop: 'cd48_Q3', mode: 'raw' },
    ],
  };
}

/** test_comp_example.fcs with FlowKit's comp_complete_example.csv imported as a workspace matrix. */
function compCsv(): Scenario {
  const file = 'flowkit/test_comp_example.fcs';
  const csv = 'flowkit/comp_complete_example.csv';
  const b = base('comp_csv', file, 'matrix compensation');
  const { add, dim, tr } = b;
  const m = parseMatrixCsv(new TextDecoder().decode(readFixture(csv)));
  b.ws.compMatrices.m1 = {
    id: 'm1',
    name: 'comp_complete_example',
    source: { kind: 'manual' },
    detectors: m.detectors,
    spill: m.spill.map((r) => [...r]),
  };
  b.group.compensation = { mode: 'matrix', matrixId: 'm1' };
  const lg = tr({ kind: 'logicle', T: 262144, W: 0.5, M: 4.5, A: 0 });
  add(
    {
      id: 'scat',
      parentPop: 'root',
      dims: [dim('FSC-A', null), dim('SSC-A', null)],
      geometry: { kind: 'rect', min: [80000, 15000], max: [180000, 90000] },
    },
    ['in'],
  );
  add(
    {
      id: 'q',
      parentPop: 'scat_in',
      dims: [dim('PE-A', lg), dim('PerCP-Cy55-A', lg)],
      geometry: { kind: 'quadrant', center: [0.35, 0.3] },
    },
    ['Q1', 'Q2', 'Q3', 'Q4'],
  );
  add(
    {
      id: 'cd4',
      parentPop: 'scat_in',
      dims: [dim('PacBlu-A', lg), dim('PE-Cy7-A', lg)],
      geometry: {
        kind: 'polygon',
        vertices: [
          [0.3, 0.25],
          [0.8, 0.25],
          [0.8, 0.8],
          [0.3, 0.8],
        ],
      },
    },
    ['in'],
  );
  add({ id: 'p38', parentPop: 'cd4_in', dims: [dim('Ax647-A', lg)], geometry: { kind: 'split', at: 0.3 } }, [
    'lo',
    'hi',
  ]);
  return {
    name: 'comp_csv',
    file,
    compensation: { kind: 'csv', path: csv },
    ...pick(b),
    statTransforms: [lg],
    fcsExports: [{ pop: 'p38_hi', mode: 'compensated' }],
  };
}

function pick(b: ReturnType<typeof base>) {
  return { ws: b.ws, group: b.group, sampleId: b.sampleId, ds: b.ds, data: b.data };
}

const BUILDERS: Record<ScenarioName, { file: string; build: () => Scenario }> = {
  data1: { file: 'flowkit/gate_ref/data1.fcs', build: data1 },
  comp_kw: { file: 'flowio/100715.fcs', build: compKw },
  comp_csv: { file: 'flowkit/test_comp_example.fcs', build: compCsv },
};

/** The scenarios whose FCS files are present. */
export function scenarios(): Scenario[] {
  return Object.values(BUILDERS)
    .filter((x) => hasFixture(x.file))
    .map((x) => x.build());
}

export function engineFor(sc: Scenario): { engine: Engine; ctx: AnalysisContext } {
  const storage = new MemoryStorage();
  storage.put(sc.data);
  return {
    engine: new Engine(storage),
    ctx: { group: sc.group, transforms: sc.ws.transforms, compMatrices: sc.ws.compMatrices },
  };
}

export function gatingML(sc: Scenario): string {
  return exportGatingML(sc.ws, sc.group, { appVersion: 'golden' });
}

/** What generate.py needs to evaluate a scenario. */
export function manifest(sc: Scenario) {
  return {
    scenario: sc.name,
    file: sc.file,
    compensation: sc.compensation,
    gml: inputPath.gml(sc),
    sha256: sc.data.sha256,
    populations: Object.values(sc.group.template.populations)
      .filter((p) => p.gate !== null)
      .map((p) => ({ id: p.id, parent: p.parent })),
    transforms: Object.fromEntries(sc.statTransforms.map((id) => [id, sc.ws.transforms[id]!])),
    fcs_exports: sc.fcsExports.map((e) => ({ ...e, path: inputPath.fcs(sc, e) })),
  };
}
