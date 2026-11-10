/**
 * Kernel benchmark (not part of the test suite):
 *   corepack pnpm exec vite-node packages/engine/bench/kernels.bench.ts
 * Env: N events (default 1M), P channels (default 30).
 *
 * Each line prints the time and a hash of the output, so a run before and after an optimization shows
 * both the speedup and that the results are bit-identical.
 */
import { parseFcs, writeFcs } from '@flowmeris/fcs';
import { type Gate, type Group, type PlotSpec, type PlotStyle, newGroup } from '@flowmeris/model';
import { gaussianMixture } from '@flowmeris/testkit';
import { logicleDef, makeScale } from '@flowmeris/transforms';
import { Engine, MemoryStorage, sampleDataFromDataset } from '../src/index.ts';
import type { AnalysisContext } from '../src/types.ts';

const N = Number(process.env.N ?? 1_000_000);
const P = Number(process.env.P ?? 30);
const chans = Array.from({ length: P }, (_, i) => `C${i}`);

/** FNV-1a over the bytes of typed arrays (or strings). */
function hash(...parts: (ArrayBufferView | string)[]): string {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const b =
      typeof p === 'string'
        ? new TextEncoder().encode(p)
        : new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
    for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i]!, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

async function run<T>(label: string, fn: () => T | Promise<T>, digest: (r: T) => string): Promise<T> {
  const t = performance.now();
  const r = await fn();
  const ms = performance.now() - t;
  console.log(`${label.padEnd(28)} ${ms.toFixed(1).padStart(9)} ms  ${digest(r)}`);
  return r;
}

const { columns } = gaussianMixture(
  N,
  [
    { weight: 1, mean: chans.map(() => 1000), sd: chans.map(() => 800) },
    { weight: 1, mean: chans.map(() => 20000), sd: chans.map(() => 6000) },
  ],
  7,
);
const f32 = columns.map((c) => Float32Array.from(c));
console.log(`${N} events × ${P} channels`);

const fcs = await run(
  'writeFcs',
  () => writeFcs(chans.map((pnn, i) => ({ pnn, values: f32[i]! }))),
  (b) => hash(b),
);
const parsed = await run(
  'parseFcs',
  () => parseFcs(fcs),
  (f) => hash(...f.datasets[0]!.columns),
);

const logicle = makeScale(logicleDef());
await run(
  'logicle applyArray',
  () => logicle.applyArray(f32[0]!),
  (r) => hash(r),
);

const storage = new MemoryStorage();
const sample = sampleDataFromDataset(parsed.datasets[0]!, 'b'.padEnd(64, '0'));
storage.put(sample);
const det = chans.slice(0, 16);
const spill = det.map((_, i) => det.map((_, j) => (i === j ? 1 : 0.02 * ((i + j) % 5))));
const group: Group = newGroup('g', [sample.sampleId], chans);
group.compensation = { mode: 'matrix', matrixId: 'm1' };
const ctx: AnalysisContext = {
  group,
  transforms: { lg: logicleDef() },
  compMatrices: { m1: { id: 'm1', name: 'm', source: { kind: 'manual' }, detectors: det, spill } },
};
const dim = (c: string): Gate['dims'][number] => ({ channel: c, comp: 'group', transform: 'lg' });
// A 200-vertex polygon around the upper cluster, then a rect under it.
const verts: [number, number][] = Array.from({ length: 200 }, (_, k) => {
  const a = (2 * Math.PI * k) / 200;
  const r = 0.12 * (1 + 0.3 * Math.sin(7 * a));
  return [0.8 + r * Math.cos(a), 0.8 + r * Math.sin(a)];
});
group.template.gates.poly = {
  id: 'poly',
  parentPop: 'root',
  dims: [dim('C0'), dim('C1')],
  geometry: { kind: 'polygon', vertices: verts },
};
group.template.populations.p = {
  id: 'p',
  parent: 'root',
  gate: 'poly',
  region: 'in',
  name: 'p',
  color: '#000',
};
const engine = new Engine(storage, { cacheBytes: 2 ** 31, sampleBytes: 2 ** 31 });
await run(
  'counts (polygon, cold)',
  () => engine.counts(ctx, sample.sampleId, ['p']),
  (r) => JSON.stringify(r.map((c) => c.count)),
);

const style: PlotStyle = {
  colormap: 'viridis',
  pointPx: 1,
  smoothPct: 1,
  contour: { mode: 'equal-prob', pct: 5 },
  showOutliers: true,
  outlierPx: 2,
  outlierColor: '#000000',
  contourWidth: 1,
  zebraLines: true,
  zebraColors: ['#000000', '#ffffff'],
  histBins: 256,
  histNorm: 'count',
  histSmooth: false,
};
const axis = (c: string) => ({ ...dim(c), transform: 'lg', range: [0, 1] as [number, number] });
for (const kind of ['dot', 'pseudocolor', 'pseudocolor-channel', 'zebra'] as const) {
  const plot: PlotSpec = {
    id: 'pl',
    population: 'root',
    kind,
    x: axis('C2'),
    y: axis('C3'),
    color: { ...axis('C4'), stat: 'median' },
    style,
  };
  await run(
    `raster ${kind}`,
    () =>
      engine.raster(ctx, { sampleId: sample.sampleId, plot, width: 800, height: 800, dotColor: '#123456' }),
    (r) => hash(r.rgba, JSON.stringify(r.contours), `${r.eventsPlotted},${r.offScale},${r.nan}`),
  );
}

const specs = ['median', 'mean', 'sd', 'cv', 'mad', 'rcv'].map((stat) => ({
  id: stat,
  population: 'p',
  stat: stat as 'median',
  channel: 'C5',
  space: 'linear' as const,
}));
await run(
  'stats (6 on polygon pop)',
  () => engine.stats(ctx, sample.sampleId, specs),
  (r) => hash(JSON.stringify(r)),
);
await run(
  'populationEvents comp',
  () => engine.populationEvents(ctx, sample.sampleId, 'p', 'compensated'),
  (r) => hash(...r.columns),
);
console.log(`engine cache: ${(engine.cacheBytes / 2 ** 20).toFixed(0)} MB`);
