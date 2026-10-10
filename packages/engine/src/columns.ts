import {
  type SpilloverMatrix,
  compensateChannel,
  findSpillover,
  makeCompensator,
} from '@flowmeris/compensation';
import { linearize } from '@flowmeris/fcs';
import type { CompRef } from '@flowmeris/model';
import { makeScale } from '@flowmeris/transforms';
import { type Fingerprints, sampleKey } from './keys.ts';
import { LruCache } from './lru.ts';
import { BoundedMemo, type Cached, memo } from './memo.ts';
import type { AnalysisContext, SampleData, StorageAdapter } from './types.ts';

/** Resolved compensation: the spillover matrix (null = none) and its fingerprint. */
interface ResolvedComp {
  m: SpilloverMatrix | null;
  key: string;
}

const NO_COMP: ResolvedComp = { m: null, key: 'none' };

/**
 * Sample data and its columns: loading samples and the stored columns a computation reads, then
 * linearising, compensating and transforming them (all cached by content, ADR-0004).
 */
export class Columns {
  private samples: LruCache<SampleData>;
  private loading = new Map<string, Promise<SampleData>>();
  private columnLoads = new WeakMap<SampleData, Map<number, Promise<void>>>();
  /**
   * Content-keyed memo of resolved compensation (hashing dominates warm requests otherwise). Keyed by
   * content rather than object identity: each request arrives as a fresh structured clone.
   */
  private compMemo = new BoundedMemo<ResolvedComp>(256);

  constructor(
    private storage: StorageAdapter,
    private cache: LruCache<Cached>,
    private keys: Fingerprints,
    sampleBytes: number,
  ) {
    this.samples = new LruCache<SampleData>(sampleBytes, (s) =>
      s.columns.reduce((a, c) => a + (c?.byteLength ?? 0), 0),
    );
  }

  setBudget(sampleBytes: number): void {
    this.samples.setBudget(sampleBytes);
  }

  /** Register in-memory sample data (e.g. right after ingest). */
  putSample(s: SampleData): void {
    this.samples.set(s.sampleId, s);
  }

  async sample(id: string): Promise<SampleData> {
    const hit = this.samples.get(id);
    if (hit) return hit;
    let p = this.loading.get(id);
    if (!p) {
      p = this.storage.loadSample(id).then((s) => {
        this.samples.set(id, s);
        this.loading.delete(id);
        return s;
      });
      this.loading.set(id, p);
    }
    return p;
  }

  /**
   * Make sure the stored columns a computation reads are in memory: the channels
   * of every gate on the populations' lineages plus `dims`, and all matrix
   * detectors when a compensated matrix channel is involved.
   */
  async ensure(
    ctx: AnalysisContext,
    s: SampleData,
    popIds: (string | null | undefined)[],
    dims: { channel: string; comp: CompRef }[] = [],
  ): Promise<void> {
    if (!s.columns.includes(null)) return;
    const all = [...dims];
    const { gates, populations } = ctx.group.template;
    const seen = new Set<string>();
    const walk = (popId: string | null | undefined) => {
      if (!popId || seen.has(popId)) return;
      seen.add(popId);
      const gateId = populations[popId]?.gate;
      const gate = gateId ? gates[gateId] : undefined;
      if (!gate) return;
      all.push(...gate.dims);
      walk(gate.parentPop);
    };
    popIds.forEach(walk);
    const need = new Set<number>();
    let comp: number[] | null = null;
    for (const d of all) {
      const ci = this.channelIndex(s, d.channel);
      need.add(ci);
      if (d.comp !== 'group') continue;
      if (comp === null) {
        const m = this.resolveComp(ctx, s);
        comp = m
          ? makeCompensator(
              m,
              s.channels.map((c) => c.pnn),
            ).channelIndex
          : [];
      }
      if (comp.includes(ci)) for (const k of comp) need.add(k);
    }
    await this.load(s, [...need]);
  }

  /** Load the stored columns `cis` that are not in memory yet. */
  async load(s: SampleData, cis: number[]): Promise<void> {
    const missing = cis.filter((ci) => s.columns[ci] === null);
    if (missing.length === 0) return;
    if (!s.loadColumn) throw new Error(`Sample ${s.sampleId} has unloaded columns but no loader`);
    let inflight = this.columnLoads.get(s);
    if (!inflight) {
      inflight = new Map();
      this.columnLoads.set(s, inflight);
    }
    const pending = inflight;
    await Promise.all(
      missing.map((ci) => {
        let p = pending.get(ci);
        if (!p) {
          p = s.loadColumn!(ci)
            .then((col) => {
              s.columns[ci] = col;
            })
            .finally(() => pending.delete(ci));
          pending.set(ci, p);
        }
        return p;
      }),
    );
    // Re-insert so the sample cache accounts for the columns now held.
    if (this.samples.get(s.sampleId) === s) this.samples.set(s.sampleId, s);
  }

  /** A stored column, which ensure() must have loaded. */
  private stored(s: SampleData, ci: number): Float32Array | Float64Array {
    const c = s.columns[ci];
    if (!c) throw new Error(`Channel ${s.channels[ci]?.pnn} of sample ${s.sampleId} is not loaded`);
    return c;
  }

  channelIndex(s: SampleData, pnn: string): number {
    const i = s.channels.findIndex((c) => c.pnn === pnn);
    if (i < 0) throw new Error(`Channel "${pnn}" not found in sample ${s.sampleId}`);
    return i;
  }

  linear(s: SampleData, ci: number): Float64Array {
    return memo(this.cache, `lin|${sampleKey(s)}|${ci}`, () =>
      linearize(this.stored(s, ci), s.channels[ci]!.scaling),
    );
  }

  /**
   * The group's compensation resolved for a sample. Memoised by content: a
   * keyword matrix depends only on the sample's (immutable, content-addressed)
   * keywords, a workspace matrix only on its detectors and values.
   */
  private comp(ctx: AnalysisContext, s: SampleData): ResolvedComp {
    const c = ctx.group.compensation;
    if (c.mode === 'none') return NO_COMP;
    if (c.mode === 'per-sample-keyword') {
      return this.compMemo.get(`kw|${sampleKey(s)}`, () => {
        const m = findSpillover(s.keywords)?.matrix ?? null;
        return m ? { m, key: this.keys.fp(m) } : NO_COMP;
      });
    }
    const cm = ctx.compMatrices[c.matrixId];
    if (!cm) throw new Error(`Compensation matrix ${c.matrixId} not found`);
    return this.compMemo.get(`mx|${JSON.stringify([cm.detectors, cm.spill])}`, () => {
      const m = { detectors: cm.detectors, spill: cm.spill };
      return { m, key: this.keys.fp(m) };
    });
  }

  /** The spillover matrix the group's compensation setting resolves to for this sample (null = none). */
  resolveComp(ctx: AnalysisContext, s: SampleData): SpilloverMatrix | null {
    return this.comp(ctx, s).m;
  }

  compKey(ctx: AnalysisContext, s: SampleData): string {
    return this.comp(ctx, s).key;
  }

  /** Linear values of a channel after the group's compensation (pass-through for non-matrix channels). */
  compensated(ctx: AnalysisContext, s: SampleData, ci: number): Float64Array {
    const { m, key: ck } = this.comp(ctx, s);
    if (!m) return this.linear(s, ci);
    return memo(this.cache, `comp|${sampleKey(s)}|${ci}|${ck}`, () => {
      const comp = makeCompensator(
        m,
        s.channels.map((c) => c.pnn),
      );
      if (!comp.channelIndex.includes(ci)) return this.linear(s, ci);
      const cols = s.channels.map((_, k) =>
        comp.channelIndex.includes(k) ? this.linear(s, k) : new Float64Array(0),
      );
      return compensateChannel(comp, cols, ci) as Float64Array;
    });
  }

  /** Values of a channel in a dimension's space: compensation, then transform (null = linear). */
  column(
    ctx: AnalysisContext,
    s: SampleData,
    dim: { channel: string; comp: CompRef; transform: string | null },
  ): Float64Array {
    const ci = this.channelIndex(s, dim.channel);
    if (dim.transform === null)
      return dim.comp === 'group' ? this.compensated(ctx, s, ci) : this.linear(s, ci);
    // The untransformed input is only touched on a miss, and an uncompensated one is not cached:
    // it is cheap to recompute and would otherwise crowd transformed columns out of the cache.
    return memo(this.cache, this.columnKey(ctx, s, ci, dim), () =>
      makeScale(ctx.transforms[dim.transform!]!).applyArray(
        dim.comp === 'group' && this.resolveComp(ctx, s)
          ? this.compensated(ctx, s, ci)
          : this.linearUncached(s, ci),
      ),
    );
  }

  /** linear() without adding the result to the cache (it is still reused when already there). */
  private linearUncached(s: SampleData, ci: number): Float64Array {
    return (
      (this.cache.get(`lin|${sampleKey(s)}|${ci}`) as Float64Array | undefined) ??
      linearize(this.stored(s, ci), s.channels[ci]!.scaling)
    );
  }

  /** Identifies a column's values: channel, compensation and transform. */
  columnKey(
    ctx: AnalysisContext,
    s: SampleData,
    ci: number,
    dim: { comp: CompRef; transform: string | null },
  ): string {
    const ck = dim.comp === 'group' ? this.compKey(ctx, s) : 'raw';
    if (dim.transform === null) return `lin|${sampleKey(s)}|${ci}|${ck}`;
    const def = ctx.transforms[dim.transform];
    if (!def) throw new Error(`Transform ${dim.transform} not found`);
    return `tr|${sampleKey(s)}|${ci}|${ck}|${this.keys.fp(def)}`;
  }
}
