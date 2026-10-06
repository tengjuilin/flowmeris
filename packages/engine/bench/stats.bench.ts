/**
 * Statistics-path benchmark (not part of the test suite):
 *   corepack pnpm exec vite-node packages/engine/bench/stats.bench.ts
 * Env: N events per sample (default 500k), S samples (default 4).
 */
import { type Gate, type Group, newGroup } from '@flowmeris/model';
import { gaussianMixture } from '@flowmeris/testkit';
import { Engine, MemoryStorage } from '../src/index.ts';
import type { AnalysisContext, SampleData, StatSpec } from '../src/types.ts';

const N = Number(process.env.N ?? 500_000);
const S = Number(process.env.S ?? 4);
const chans = Array.from({ length: 12 }, (_, i) => `C${i}`);
const storage = new MemoryStorage();
const ids: string[] = [];
for (let k = 0; k < S; k++) {
  const { columns } = gaussianMixture(
    N,
    [
      { weight: 1, mean: chans.map(() => 1000), sd: chans.map(() => 300) },
      { weight: 1, mean: chans.map(() => 3000), sd: chans.map(() => 600) },
    ],
    k + 1,
  );
  const s: SampleData = {
    sampleId: `s${k}`,
    sha256: `${k}`.padEnd(64, 'a'),
    datasetIndex: 0,
    eventCount: N,
    channels: chans.map((pnn) => ({
      pnn,
      scaling: { logDecades: 0, logOffset: 0, range: 262144, gain: 1, timestep: 1 },
    })),
    columns: columns.map((c) => Float32Array.from(c)),
    keywords: {},
  };
  storage.put(s);
  ids.push(s.sampleId);
}
const det = chans.slice(2);
const spill = det.map((_, i) => det.map((_, j) => (i === j ? 1 : 0.01 * ((i + j) % 5))));
const group: Group = newGroup('g', ids, chans);
group.compensation = { mode: 'matrix', matrixId: 'm1' };
const ctx: AnalysisContext = {
  group,
  transforms: {},
  compMatrices: { m1: { id: 'm1', name: 'm', source: { kind: 'manual' }, detectors: det, spill } },
};
// A chain of rect gates (depth 6) with a quadrant gate under each level.
let parent = 'root';
for (let d = 0; d < 6; d++) {
  const dims: Gate['dims'] = [
    { channel: `C${d}`, comp: 'group', transform: null },
    { channel: `C${d + 1}`, comp: 'group', transform: null },
  ];
  group.template.gates[`g${d}`] = {
    id: `g${d}`,
    parentPop: parent,
    dims,
    geometry: { kind: 'rect', min: [0, 0], max: [5000, 5000] },
  };
  group.template.populations[`p${d}`] = {
    id: `p${d}`,
    parent,
    gate: `g${d}`,
    region: 'in',
    name: `p${d}`,
    color: '#000',
  };
  group.template.gates[`q${d}`] = {
    id: `q${d}`,
    parentPop: `p${d}`,
    dims,
    geometry: { kind: 'quadrant', center: [2000, 2000] },
  };
  for (const r of ['Q1', 'Q2', 'Q3', 'Q4'] as const)
    group.template.populations[`q${d}${r}`] = {
      id: `q${d}${r}`,
      parent: `p${d}`,
      gate: `q${d}`,
      region: r,
      name: r,
      color: '#000',
    };
  parent = `p${d}`;
}
const popIds = Object.keys(group.template.populations);
const specs: StatSpec[] = [];
for (const pop of ['p1', 'p3', 'p5', 'q2Q1'])
  for (const stat of ['median', 'mean', 'sd', 'rcv', 'geomMean'] as const)
    for (const ch of ['C2', 'C8'])
      specs.push({ id: `${pop}${stat}${ch}`, population: pop, stat, channel: ch, space: 'linear' });

const engine = new Engine(storage, { cacheBytes: 2 ** 31, sampleBytes: 2 ** 31 });
async function run(label: string, fn: () => Promise<unknown>, reps = 1) {
  const t = performance.now();
  for (let i = 0; i < reps; i++) await fn();
  console.log(`${label}: ${((performance.now() - t) / reps).toFixed(1)} ms`);
}
const each = (fn: (sid: string) => Promise<unknown>) => () => Promise.all(ids.map(fn));
console.log(`${S} samples × ${N} events, ${popIds.length} populations, ${specs.length} statistics`);
await run(
  'cold counts',
  each((sid) => engine.counts(ctx, sid, popIds)),
);
await run(
  'cold stats',
  each((sid) => engine.stats(ctx, sid, specs)),
);
await run(
  'warm counts',
  each((sid) => engine.counts(ctx, sid, popIds)),
  5,
);
await run(
  'warm stats',
  each((sid) => engine.stats(ctx, sid, specs)),
  3,
);
const extra: StatSpec = { id: 'x', population: 'p4', stat: 'median', channel: 'C9', space: 'linear' };
await run(
  'warm stats + 1 new',
  each((sid) => engine.stats(ctx, sid, [...specs, extra])),
);
