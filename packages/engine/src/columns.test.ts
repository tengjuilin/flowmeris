import { compensateChannel, makeCompensator } from '@flowmeris/compensation';
import { linearize } from '@flowmeris/fcs';
import { type ChannelScaling, newGroup } from '@flowmeris/model';
import { logicleDef, makeScale } from '@flowmeris/transforms';
import { describe, expect, it } from 'vitest';
import { Columns } from './columns.ts';
import { Engine } from './engine.ts';
import { Fingerprints, sampleKey } from './keys.ts';
import { LruCache } from './lru.ts';
import type { Cached } from './memo.ts';
import { MemoryStorage } from './storage-memory.ts';
import type { AnalysisContext, SampleData } from './types.ts';

const scaling = (s: Partial<ChannelScaling>): ChannelScaling => ({
  logDecades: 0,
  logOffset: 0,
  range: 262144,
  gain: 1,
  timestep: 1,
  ...s,
});

const N = 500;
function synthetic(): SampleData {
  const f32 = (k: number) =>
    Float32Array.from({ length: N }, (_, i) => ((i * 7919 + k * 31) % 2000) - 300.25);
  const channels = [
    { pnn: 'A', scaling: scaling({}) },
    { pnn: 'B', scaling: scaling({ gain: 3 }) },
    { pnn: 'C', scaling: scaling({ logDecades: 4, logOffset: 1, range: 1024 }) },
    { pnn: 'D', scaling: scaling({}) },
    { pnn: 'Time', scaling: scaling({ timestep: 0.01 }) },
  ];
  const columns = [f32(1), f32(2), f32(3), Float64Array.from(f32(4), (v) => v * 1e3 + 0.1), f32(5)];
  return {
    sampleId: 's',
    sha256: 'c'.repeat(64),
    datasetIndex: 0,
    eventCount: N,
    channels,
    columns,
    keywords: {},
  };
}

const bytes = (a: Float64Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

function setup() {
  const s = synthetic();
  const storage = new MemoryStorage();
  storage.put(s);
  const cache = new LruCache<Cached>(2 ** 30, (v) => v.byteLength);
  const cols = new Columns(storage, cache, new Fingerprints(), 2 ** 30);
  const det = ['A', 'B', 'C', 'D'];
  const spill = det.map((_, i) => det.map((_, j) => (i === j ? 1 : 0.01 * ((i + 2 * j) % 4))));
  const group = newGroup('g', [s.sampleId], ['A', 'B', 'C', 'D', 'Time']);
  group.compensation = { mode: 'matrix', matrixId: 'm' };
  const ctx: AnalysisContext = {
    group,
    transforms: { lg: logicleDef(262144) },
    compMatrices: { m: { id: 'm', name: 'm', source: { kind: 'manual' }, detectors: det, spill } },
  };
  return { s, cache, cols, ctx };
}

describe('Columns', () => {
  it('transforms uncompensated channels from their stored values without caching linear columns', () => {
    const { s, cache, cols, ctx } = setup();
    const scale = makeScale(ctx.transforms.lg!);
    s.channels.forEach((c, ci) => {
      const got = cols.column(ctx, s, { channel: c.pnn, comp: 'uncompensated', transform: 'lg' });
      const want = scale.applyArray(linearize(s.columns[ci]!, c.scaling));
      expect(bytes(got)).toEqual(bytes(want));
      expect(cache.has(`lin|${sampleKey(s)}|${ci}`)).toBe(false);
    });
  });
  it('compensates from detector inputs it does not cache', () => {
    const { s, cache, cols, ctx } = setup();
    const ref = reference(s, ctx);
    s.channels.forEach((_, ci) => {
      expect(bytes(cols.compensated(ctx, s, ci))).toEqual(bytes(ref[ci]!));
    });
    for (const ci of [0, 1, 2, 3]) expect(cache.has(`lin|${sampleKey(s)}|${ci}`)).toBe(false);
  });
});

/** Every channel's whole compensated column, from fully linearized columns. */
function reference(s: SampleData, ctx: AnalysisContext): Float64Array[] {
  const m = ctx.compMatrices.m!;
  const comp = makeCompensator(
    { detectors: m.detectors, spill: m.spill },
    s.channels.map((c) => c.pnn),
  );
  const lin = s.channels.map((c, ci) => linearize(s.columns[ci]!, c.scaling));
  return lin.map((col, ci) => compensateChannel(comp, lin, ci) ?? col);
}

describe('populationEvents', () => {
  it("gives the whole columns' values at the population's events", async () => {
    for (const all of [true, false]) {
      const { s, ctx } = setup();
      const [lo, hi] = all ? [-1e9, 1e9] : [0, 300];
      ctx.group.template.gates.g1 = {
        id: 'g1',
        parentPop: 'root',
        dims: [
          { channel: 'A', comp: 'uncompensated', transform: null },
          { channel: 'B', comp: 'uncompensated', transform: null },
        ],
        geometry: { kind: 'rect', min: [lo, lo], max: [3 * hi, hi] },
      };
      ctx.group.template.populations.p1 = {
        id: 'p1',
        name: 'P1',
        gate: 'g1',
        parent: 'root',
        region: 'in',
        color: '#2a78d6',
      };
      const storage = new MemoryStorage();
      storage.put(s);
      const engine = new Engine(storage);
      const comp = reference(s, ctx);
      const lin = s.channels.map((c, ci) => linearize(s.columns[ci]!, c.scaling));
      const a = s.columns[0]!;
      const b = s.columns[1]!;
      const inside = (v: number, max: number) => v >= lo && v <= max;
      const idx = [...a.keys()].filter((e) => inside(a[e]!, 3 * hi) && inside(b[e]! / 3, hi));
      expect(idx.length === N).toBe(all);
      for (const mode of ['raw', 'compensated'] as const) {
        const got = await engine.populationEvents(ctx, s.sampleId, 'p1', mode);
        const full = mode === 'raw' ? lin : comp;
        expect(got.count).toBe(idx.length);
        got.columns.forEach((col, ci) => {
          expect(bytes(col)).toEqual(bytes(Float64Array.from(idx, (e) => full[ci]![e]!)));
        });
      }
    }
  });
});
