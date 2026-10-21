/**
 * The scenarios' types and the workspace each scenario starts from (one sample in one group, with fixed
 * ids and times so exported files are byte-stable). The scenarios are in golden-scenario.ts.
 */
import { createHash } from 'node:crypto';
import { type SampleData, sampleDataFromDataset, sampleMetaFromDataset } from '@flowmeris/engine';
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
  transformId,
} from '@flowmeris/model';
import { readFixture } from '@flowmeris/testkit';

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

/** A scenario's workspace, with helpers to register transforms and add gates with their populations. */
export function base(name: ScenarioName, file: string, groupName: string) {
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

export function pick(b: ReturnType<typeof base>) {
  return { ws: b.ws, group: b.group, sampleId: b.sampleId, ds: b.ds, data: b.data };
}
