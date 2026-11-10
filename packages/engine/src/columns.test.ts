import { linearize } from '@flowmeris/fcs';
import { type ChannelScaling, newGroup } from '@flowmeris/model';
import { logicleDef, makeScale } from '@flowmeris/transforms';
import { describe, expect, it } from 'vitest';
import { Columns } from './columns.ts';
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
});
