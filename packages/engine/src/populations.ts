import { type Bitset, evaluateGate, fullBitset, popcount, regionsOf, toIndices } from '@flowmeris/gating';
import { type GateDim, ROOT_POPULATION_ID, effectiveGeometry } from '@flowmeris/model';
import type { Columns } from './columns.ts';
import { type Fingerprints, KERNEL_VERSION, type KeyMemo, sampleKey } from './keys.ts';
import type { LruCache } from './lru.ts';
import { type Cached, memo } from './memo.ts';
import type { AnalysisContext, PopulationCount, SampleData } from './types.ts';

/** Population membership (bitsets and indices) and counts, cached by their lineage's content (ADR-0004). */
export class Populations {
  constructor(
    private cache: LruCache<Cached>,
    private columns: Columns,
    private keys: Fingerprints,
  ) {}

  private dimsKey(ctx: AnalysisContext, s: SampleData, dims: GateDim[]): unknown {
    return dims.map((d) => ({
      c: d.channel,
      comp: d.comp === 'group' ? this.columns.compKey(ctx, s) : 'raw',
      t: d.transform === null ? null : (ctx.transforms[d.transform] ?? d.transform),
    }));
  }

  /**
   * Cache key of a population's membership for a sample (ADR-0004). Pass one `memo` across the
   * calls of a single request so each ancestor's key is hashed once, not once per descendant.
   */
  key(ctx: AnalysisContext, s: SampleData, popId: string, memo: KeyMemo = new Map()): string {
    const hit = memo.get(popId);
    if (hit !== undefined) return hit;
    const pop = ctx.group.template.populations[popId];
    if (!pop) throw new Error(`Unknown population ${popId}`);
    let key: string;
    if (popId === ROOT_POPULATION_ID || pop.gate === null) key = `bits|${sampleKey(s)}|root`;
    else {
      const gate = ctx.group.template.gates[pop.gate];
      if (!gate) throw new Error(`Unknown gate ${pop.gate}`);
      const parentKey = this.key(ctx, s, gate.parentPop, memo);
      const geom = effectiveGeometry(ctx.group, gate.id, s.sampleId);
      key = `bits|${this.keys.fp({ p: parentKey, g: geom, d: this.dimsKey(ctx, s, gate.dims), k: KERNEL_VERSION })}|${pop.region}`;
    }
    memo.set(popId, key);
    return key;
  }

  bits(ctx: AnalysisContext, s: SampleData, popId: string, memo: KeyMemo = new Map()): Bitset {
    const key = this.key(ctx, s, popId, memo);
    const hit = this.cache.get(key) as Bitset | undefined;
    if (hit) return hit;
    const pop = ctx.group.template.populations[popId]!;
    if (pop.gate === null) {
      const b = fullBitset(s.eventCount);
      this.cache.set(key, b);
      return b;
    }
    const gate = ctx.group.template.gates[pop.gate]!;
    const parent = this.bits(ctx, s, gate.parentPop, memo);
    const geom = effectiveGeometry(ctx.group, gate.id, s.sampleId);
    const dims = gate.dims.map((d) => this.columns.column(ctx, s, d));
    const res = evaluateGate(geom, dims, s.eventCount, parent);
    // Cache every region the gate produced (all four quadrants in one pass).
    const base = key.slice(0, key.lastIndexOf('|'));
    for (const r of regionsOf(geom)) {
      const b = res.regions[r];
      if (b) this.cache.set(`${base}|${r}`, b);
    }
    const out = res.regions[pop.region];
    if (!out) throw new Error(`Gate ${gate.id} has no region ${pop.region}`);
    return out;
  }

  /**
   * Indices of a population's events, or null when it holds every event (kernels then scan all
   * events without materializing an index array). Cached alongside the bitset.
   */
  indices(
    ctx: AnalysisContext,
    s: SampleData,
    popId: string,
    keyMemo: KeyMemo = new Map(),
  ): Uint32Array | null {
    const bits = this.bits(ctx, s, popId, keyMemo);
    if (popcount(bits) === s.eventCount) return null;
    return memo(this.cache, `idx|${this.key(ctx, s, popId, keyMemo)}`, () => toIndices(bits));
  }

  /** Each population's count, with its parent's, grandparent's and the sample's total. */
  counts(ctx: AnalysisContext, s: SampleData, popIds: string[], memo: KeyMemo): PopulationCount[] {
    const pops = ctx.group.template.populations;
    const n = new Map<string, number>();
    const countOf = (id: string | null | undefined) => {
      if (!id) return Number.NaN;
      let c = n.get(id);
      if (c === undefined) {
        c = popcount(this.bits(ctx, s, id, memo));
        n.set(id, c);
      }
      return c;
    };
    return popIds.map((popId) => {
      const p = pops[popId];
      if (!p) throw new Error(`Unknown population ${popId}`);
      const parent = p.parent ? pops[p.parent] : undefined;
      return {
        popId,
        count: countOf(popId),
        parentCount: countOf(p.parent),
        grandparentCount: countOf(parent?.parent),
        totalCount: s.eventCount,
      };
    });
  }
}
