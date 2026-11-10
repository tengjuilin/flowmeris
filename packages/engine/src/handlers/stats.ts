import { type ValueStat, summarize } from '@flowmeris/stats';
import type { Columns } from '../columns.ts';
import { type KeyMemo, statKey } from '../keys.ts';
import type { LruCache } from '../lru.ts';
import type { Cached } from '../memo.ts';
import type { Populations } from '../populations.ts';
import type { AnalysisContext, SampleData, StatResult, StatSpec } from '../types.ts';

const FREQUENCY_STATS = new Set(['count', 'pctParent', 'pctGrandparent', 'pctTotal', 'pctOf']);

const statTransform = (spec: StatSpec): string | null =>
  spec.space === 'transformed' ? (spec.transform ?? null) : null;

/** The channels the value statistics in `specs` read, for Columns.ensure(). */
export const statDims = (specs: StatSpec[]) =>
  specs.flatMap((sp) => (sp.channel ? [{ channel: sp.channel, comp: 'group' as const }] : []));

/** A column's values at `idx` (all `n` events when null), in a new array. */
function gather(col: Float64Array, idx: Uint32Array | null, n: number): Float64Array {
  if (!idx) return col.slice(0, n);
  const vals = new Float64Array(idx.length);
  for (let k = 0; k < idx.length; k++) vals[k] = col[idx[k] as number] as number;
  return vals;
}

/** Statistics of one sample, whose columns are loaded, in the order of `specs`. */
export function statsOf(
  cache: LruCache<Cached>,
  columns: Columns,
  pops: Populations,
  ctx: AnalysisContext,
  s: SampleData,
  specs: StatSpec[],
  memo: KeyMemo,
): StatResult[] {
  const sampleId = s.sampleId;
  const out: StatResult[] = [];
  // Value statistics are cached one by one, keyed by the population's and the column's
  // content keys (so a hit is always valid). Misses are grouped by (population, column)
  // so each column is gathered and ordered once.
  const groups = new Map<string, { bitsKey: string; colKey: string; specs: StatSpec[] }>();
  for (const spec of specs) {
    if (FREQUENCY_STATS.has(spec.stat)) {
      if (spec.stat === 'pctOf' && !spec.basis)
        throw new Error('Statistic pctOf requires a basis population');
      const [c, basis] = pops.counts(
        ctx,
        s,
        spec.basis ? [spec.population, spec.basis] : [spec.population],
        memo,
      );
      const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : Number.NaN);
      const value =
        spec.stat === 'count'
          ? c!.count
          : spec.stat === 'pctParent'
            ? pct(c!.count, c!.parentCount)
            : spec.stat === 'pctGrandparent'
              ? pct(c!.count, c!.grandparentCount)
              : spec.stat === 'pctOf'
                ? pct(c!.count, basis!.count)
                : pct(c!.count, c!.totalCount);
      out.push({ statId: spec.id, sampleId, value, n: c!.count, nExcluded: 0 });
      continue;
    }
    if (!spec.channel) throw new Error(`Statistic ${spec.stat} requires a channel`);
    const bitsKey = pops.key(ctx, s, spec.population, memo);
    const colKey = columns.columnKey(ctx, s, columns.channelIndex(s, spec.channel), {
      comp: 'group',
      transform: statTransform(spec),
    });
    const hit = cache.get(statKey(bitsKey, colKey, spec)) as Float64Array | undefined;
    if (hit) {
      out.push({ statId: spec.id, sampleId, value: hit[0]!, n: hit[1]!, nExcluded: hit[2]! });
      continue;
    }
    const k = `${bitsKey}|${colKey}`;
    let g = groups.get(k);
    if (!g) {
      g = { bitsKey, colKey, specs: [] };
      groups.set(k, g);
    }
    g.specs.push(spec);
  }
  for (const { bitsKey, colKey, specs: list } of groups.values()) {
    const first = list[0]!;
    // The population's events in index order (null = all of them), from the cached indices.
    const idx = pops.indices(ctx, s, first.population, memo);
    const col = columns.column(ctx, s, {
      channel: first.channel!,
      comp: 'group',
      transform: statTransform(first),
    });
    const vals = gather(col, idx, s.eventCount);
    const res = summarize(
      vals,
      list.map((sp) => ({ stat: sp.stat as ValueStat, ...(sp.p !== undefined ? { p: sp.p } : {}) })),
      true,
    );
    list.forEach((sp, i) => {
      const r = res[i]!;
      cache.set(statKey(bitsKey, colKey, sp), Float64Array.of(r.value, r.n, r.nExcluded));
      out.push({ statId: sp.id, sampleId, ...r });
    });
  }
  const order = new Map(specs.map((sp, i) => [sp.id, i]));
  return out.sort((a, b) => order.get(a.statId)! - order.get(b.statId)!);
}
