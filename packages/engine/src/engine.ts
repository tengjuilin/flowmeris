import {
  type SpilloverMatrix,
  compensateChannel,
  findSpillover,
  makeCompensator,
} from '@flowmeris/compensation';
import { linearize } from '@flowmeris/fcs';
import {
  type Bitset,
  evaluateGate,
  forEachSet,
  fullBitset,
  popcount,
  regionsOf,
  toIndices,
} from '@flowmeris/gating';
import {
  type AxisSpec,
  type CompRef,
  type Gate,
  type GateDim,
  ROOT_POPULATION_ID,
  canonicalJson,
  effectiveGeometry,
  sha256Hex,
} from '@flowmeris/model';
import { histogram, raster2d } from '@flowmeris/render';
import { type ValueStat, summarize } from '@flowmeris/stats';
import { makeScale } from '@flowmeris/transforms';
import { LruCache } from './lru.ts';
import type {
  AnalysisContext,
  GatePreviewRequest,
  GatePreviewResponse,
  HistogramResponse,
  PopulationCount,
  RasterRequest,
  RasterResponse,
  SampleData,
  StatResult,
  StatSpec,
  StorageAdapter,
} from './types.ts';

/** Bumped whenever a numerical kernel changes, so cached results are not reused (ADR-0004). */
export const KERNEL_VERSION = 'ts-1';

export interface EngineOptions {
  /** Byte budget for cached columns and bitsets. */
  cacheBytes?: number;
  /** Byte budget for loaded sample data. */
  sampleBytes?: number;
}

type Cached = Float64Array | Uint32Array;

/** Resolved compensation: the spillover matrix (null = none) and its fingerprint. */
interface ResolvedComp {
  m: SpilloverMatrix | null;
  key: string;
}

const NO_COMP: ResolvedComp = { m: null, key: 'none' };

/** Population cache keys computed within one request (a key hashes its whole lineage). */
type KeyMemo = Map<string, string>;

const FREQUENCY_STATS = new Set(['count', 'pctParent', 'pctGrandparent', 'pctTotal']);

const statTransform = (spec: StatSpec): string | null =>
  spec.space === 'transformed' ? (spec.transform ?? null) : null;

/** Cache key of one value statistic: the population's and column's content keys (ADR-0004). */
const statKey = (bitsKey: string, colKey: string, spec: StatSpec): string =>
  `stat|${KERNEL_VERSION}|${bitsKey}|${colKey}|${spec.stat}|${spec.p ?? ''}`;

/** Small string-keyed memo that is simply cleared once it grows past `max` entries. */
class BoundedMemo<V> {
  private map = new Map<string, V>();
  constructor(private max: number) {}
  get(key: string, make: () => V): V {
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    const v = make();
    if (this.map.size >= this.max) this.map.clear();
    this.map.set(key, v);
    return v;
  }
}

/**
 * The analysis engine for the samples a worker owns. All results are derived
 * from content fingerprints of their inputs, so a cache hit is always valid
 * and nothing needs explicit invalidation.
 */
export class Engine {
  private cache: LruCache<Cached>;
  private samples: LruCache<SampleData>;
  private loading = new Map<string, Promise<SampleData>>();
  /**
   * Content-keyed memos for the inputs of cache keys (hashing dominates warm requests otherwise).
   * Keyed by content rather than object identity: each request arrives as a fresh structured clone.
   */
  private compMemo = new BoundedMemo<ResolvedComp>(256);
  private fpMemo = new BoundedMemo<string>(4096);

  constructor(
    private storage: StorageAdapter,
    opts: EngineOptions = {},
  ) {
    this.cache = new LruCache<Cached>(opts.cacheBytes ?? 512 * 2 ** 20, (v) => v.byteLength);
    this.samples = new LruCache<SampleData>(opts.sampleBytes ?? 512 * 2 ** 20, (s) =>
      s.columns.reduce((a, c) => a + c.byteLength, 0),
    );
  }

  setBudgets(cacheBytes: number, sampleBytes: number): void {
    this.cache.setBudget(cacheBytes);
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

  private memo<T extends Cached>(key: string, fn: () => T): T {
    const hit = this.cache.get(key) as T | undefined;
    if (hit) return hit;
    const v = fn();
    this.cache.set(key, v);
    return v;
  }

  // -------------------------------------------------------------------------
  // Columns
  // -------------------------------------------------------------------------

  private channelIndex(s: SampleData, pnn: string): number {
    const i = s.channels.findIndex((c) => c.pnn === pnn);
    if (i < 0) throw new Error(`Channel "${pnn}" not found in sample ${s.sampleId}`);
    return i;
  }

  private sampleKey(s: SampleData): string {
    return `${s.sha256}:${s.datasetIndex}`;
  }

  linear(s: SampleData, ci: number): Float64Array {
    return this.memo(`lin|${this.sampleKey(s)}|${ci}`, () =>
      linearize(s.columns[ci] as ArrayLike<number>, s.channels[ci]!.scaling),
    );
  }

  /** fingerprint(), memoised on the value's canonical JSON (which is cheap next to SHA-256). */
  private fp(value: unknown): string {
    const json = canonicalJson(value);
    return this.fpMemo.get(json, () => sha256Hex(json).slice(0, 32));
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
      return this.compMemo.get(`kw|${this.sampleKey(s)}`, () => {
        const m = findSpillover(s.keywords)?.matrix ?? null;
        return m ? { m, key: this.fp(m) } : NO_COMP;
      });
    }
    const cm = ctx.compMatrices[c.matrixId];
    if (!cm) throw new Error(`Compensation matrix ${c.matrixId} not found`);
    return this.compMemo.get(`mx|${JSON.stringify([cm.detectors, cm.spill])}`, () => {
      const m = { detectors: cm.detectors, spill: cm.spill };
      return { m, key: this.fp(m) };
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
    return this.memo(`comp|${this.sampleKey(s)}|${ci}|${ck}`, () => {
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
    return this.memo(this.columnKey(ctx, s, ci, dim), () =>
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
      (this.cache.get(`lin|${this.sampleKey(s)}|${ci}`) as Float64Array | undefined) ??
      linearize(s.columns[ci] as ArrayLike<number>, s.channels[ci]!.scaling)
    );
  }

  /** Identifies a column's values: channel, compensation and transform. */
  private columnKey(
    ctx: AnalysisContext,
    s: SampleData,
    ci: number,
    dim: { comp: CompRef; transform: string | null },
  ): string {
    const ck = dim.comp === 'group' ? this.compKey(ctx, s) : 'raw';
    if (dim.transform === null) return `lin|${this.sampleKey(s)}|${ci}|${ck}`;
    const def = ctx.transforms[dim.transform];
    if (!def) throw new Error(`Transform ${dim.transform} not found`);
    return `tr|${this.sampleKey(s)}|${ci}|${ck}|${this.fp(def)}`;
  }

  // -------------------------------------------------------------------------
  // Populations
  // -------------------------------------------------------------------------

  private dimsKey(ctx: AnalysisContext, s: SampleData, dims: GateDim[]): unknown {
    return dims.map((d) => ({
      c: d.channel,
      comp: d.comp === 'group' ? this.compKey(ctx, s) : 'raw',
      t: d.transform === null ? null : (ctx.transforms[d.transform] ?? d.transform),
    }));
  }

  /**
   * Cache key of a population's membership for a sample (ADR-0004). Pass one `memo` across the
   * calls of a single request so each ancestor's key is hashed once, not once per descendant.
   */
  popKey(ctx: AnalysisContext, s: SampleData, popId: string, memo: KeyMemo = new Map()): string {
    const hit = memo.get(popId);
    if (hit !== undefined) return hit;
    const pop = ctx.group.template.populations[popId];
    if (!pop) throw new Error(`Unknown population ${popId}`);
    let key: string;
    if (popId === ROOT_POPULATION_ID || pop.gate === null) key = `bits|${this.sampleKey(s)}|root`;
    else {
      const gate = ctx.group.template.gates[pop.gate];
      if (!gate) throw new Error(`Unknown gate ${pop.gate}`);
      const parentKey = this.popKey(ctx, s, gate.parentPop, memo);
      const geom = effectiveGeometry(ctx.group, gate.id, s.sampleId);
      key = `bits|${this.fp({ p: parentKey, g: geom, d: this.dimsKey(ctx, s, gate.dims), k: KERNEL_VERSION })}|${pop.region}`;
    }
    memo.set(popId, key);
    return key;
  }

  popBits(ctx: AnalysisContext, s: SampleData, popId: string, memo: KeyMemo = new Map()): Bitset {
    const key = this.popKey(ctx, s, popId, memo);
    const hit = this.cache.get(key) as Bitset | undefined;
    if (hit) return hit;
    const pop = ctx.group.template.populations[popId]!;
    if (pop.gate === null) {
      const b = fullBitset(s.eventCount);
      this.cache.set(key, b);
      return b;
    }
    const gate = ctx.group.template.gates[pop.gate]!;
    const parent = this.popBits(ctx, s, gate.parentPop, memo);
    const geom = effectiveGeometry(ctx.group, gate.id, s.sampleId);
    const dims = gate.dims.map((d) => this.column(ctx, s, d));
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
   * events without materialising an index array). Cached alongside the bitset.
   */
  popIndices(
    ctx: AnalysisContext,
    s: SampleData,
    popId: string,
    memo: KeyMemo = new Map(),
  ): Uint32Array | null {
    const bits = this.popBits(ctx, s, popId, memo);
    if (popcount(bits) === s.eventCount) return null;
    return this.memo(`idx|${this.popKey(ctx, s, popId, memo)}`, () => toIndices(bits));
  }

  async counts(ctx: AnalysisContext, sampleId: string, popIds: string[]): Promise<PopulationCount[]> {
    return this.countsOf(ctx, await this.sample(sampleId), popIds, new Map());
  }

  private countsOf(ctx: AnalysisContext, s: SampleData, popIds: string[], memo: KeyMemo): PopulationCount[] {
    const pops = ctx.group.template.populations;
    const n = new Map<string, number>();
    const countOf = (id: string | null | undefined) => {
      if (!id) return Number.NaN;
      let c = n.get(id);
      if (c === undefined) {
        c = popcount(this.popBits(ctx, s, id, memo));
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

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  async stats(ctx: AnalysisContext, sampleId: string, specs: StatSpec[]): Promise<StatResult[]> {
    return this.statsOf(ctx, await this.sample(sampleId), specs, new Map());
  }

  /** Population counts and statistics of one sample in a single request (the Statistics table). */
  async table(
    ctx: AnalysisContext,
    sampleId: string,
    popIds: string[],
    specs: StatSpec[],
  ): Promise<{ counts: PopulationCount[]; stats: StatResult[] }> {
    const s = await this.sample(sampleId);
    const memo: KeyMemo = new Map();
    return { counts: this.countsOf(ctx, s, popIds, memo), stats: this.statsOf(ctx, s, specs, memo) };
  }

  private statsOf(ctx: AnalysisContext, s: SampleData, specs: StatSpec[], memo: KeyMemo): StatResult[] {
    const sampleId = s.sampleId;
    const out: StatResult[] = [];
    // Value statistics are cached one by one, keyed by the population's and the column's
    // content keys (so a hit is always valid). Misses are grouped by (population, column)
    // so each column is gathered and ordered once.
    const groups = new Map<string, { bitsKey: string; colKey: string; specs: StatSpec[] }>();
    for (const spec of specs) {
      if (FREQUENCY_STATS.has(spec.stat)) {
        const [c] = this.countsOf(ctx, s, [spec.population], memo);
        const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : Number.NaN);
        const value =
          spec.stat === 'count'
            ? c!.count
            : spec.stat === 'pctParent'
              ? pct(c!.count, c!.parentCount)
              : spec.stat === 'pctGrandparent'
                ? pct(c!.count, c!.grandparentCount)
                : pct(c!.count, c!.totalCount);
        out.push({ statId: spec.id, sampleId, value, n: c!.count, nExcluded: 0 });
        continue;
      }
      if (!spec.channel) throw new Error(`Statistic ${spec.stat} requires a channel`);
      const bitsKey = this.popKey(ctx, s, spec.population, memo);
      const colKey = this.columnKey(ctx, s, this.channelIndex(s, spec.channel), {
        comp: 'group',
        transform: statTransform(spec),
      });
      const hit = this.cache.get(statKey(bitsKey, colKey, spec)) as Float64Array | undefined;
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
      const bits = this.popBits(ctx, s, first.population, memo);
      const col = this.column(ctx, s, {
        channel: first.channel!,
        comp: 'group',
        transform: statTransform(first),
      });
      const vals = new Float64Array(popcount(bits));
      let k = 0;
      forEachSet(bits, (i) => {
        vals[k++] = col[i] as number;
      });
      const res = summarize(
        vals,
        list.map((sp) => ({ stat: sp.stat as ValueStat, ...(sp.p !== undefined ? { p: sp.p } : {}) })),
        true,
      );
      list.forEach((sp, i) => {
        const r = res[i]!;
        this.cache.set(statKey(bitsKey, colKey, sp), Float64Array.of(r.value, r.n, r.nExcluded));
        out.push({ statId: sp.id, sampleId, ...r });
      });
    }
    const order = new Map(specs.map((sp, i) => [sp.id, i]));
    return out.sort((a, b) => order.get(a.statId)! - order.get(b.statId)!);
  }

  // -------------------------------------------------------------------------
  // Plots
  // -------------------------------------------------------------------------

  private axisColumn(ctx: AnalysisContext, s: SampleData, a: AxisSpec): Float64Array {
    return this.column(ctx, s, { channel: a.channel, comp: a.comp, transform: a.transform });
  }

  async raster(ctx: AnalysisContext, req: RasterRequest): Promise<RasterResponse> {
    const s = await this.sample(req.sampleId);
    const plot = req.plot;
    if (plot.kind === 'histogram' || !plot.y) throw new Error('raster() needs a 2D plot');
    const idx = this.popIndices(ctx, s, plot.population);
    const r = raster2d({
      kind: plot.kind,
      width: req.width,
      height: req.height,
      x: this.axisColumn(ctx, s, plot.x),
      y: this.axisColumn(ctx, s, plot.y),
      indices: idx,
      xRange: plot.x.range,
      yRange: plot.y.range,
      style: plot.style,
      dotColor: req.dotColor,
    });
    return {
      width: r.width,
      height: r.height,
      rgba: r.rgba,
      contours: r.contours,
      eventsPlotted: idx ? idx.length : s.eventCount,
      offScale: r.stats.offScale,
      nan: r.stats.nan,
      sigmaPx: r.sigmaPx,
    };
  }

  async histogram(
    ctx: AnalysisContext,
    sampleId: string,
    popId: string,
    axis: AxisSpec,
    style: Parameters<typeof histogram>[3],
  ): Promise<HistogramResponse> {
    const s = await this.sample(sampleId);
    const idx = this.popIndices(ctx, s, popId);
    const h = histogram(this.axisColumn(ctx, s, axis), idx, axis.range, style);
    return {
      centers: h.centers,
      heights: h.heights,
      eventsPlotted: idx ? idx.length : s.eventCount,
      offScale: h.stats.offScale,
      nan: h.stats.nan,
    };
  }

  /** Counts a gate would produce on a sample, without committing it (live drag preview). */
  async preview(ctx: AnalysisContext, req: GatePreviewRequest): Promise<GatePreviewResponse> {
    const s = await this.sample(req.sampleId);
    const g: Gate = req.gate;
    const parent = this.popBits(ctx, s, g.parentPop);
    const dims = g.dims.map((d) => this.column(ctx, s, d));
    const res = evaluateGate(g.geometry, dims, s.eventCount, parent);
    const regions: GatePreviewResponse['regions'] = {};
    for (const [r, b] of Object.entries(res.regions))
      regions[r as keyof typeof regions] = popcount(b as Bitset);
    return { parentCount: popcount(parent), regions };
  }

  /** Event values of a population for export, in linear (compensated or not) or transformed units. */
  async populationEvents(
    ctx: AnalysisContext,
    sampleId: string,
    popId: string,
    mode: 'raw' | 'compensated',
  ): Promise<{ channels: string[]; columns: Float64Array[]; count: number }> {
    const s = await this.sample(sampleId);
    const idx = toIndices(this.popBits(ctx, s, popId));
    const columns = s.channels.map((_, ci) => {
      const src = mode === 'compensated' ? this.compensated(ctx, s, ci) : this.linear(s, ci);
      const out = new Float64Array(idx.length);
      for (let i = 0; i < idx.length; i++) out[i] = src[idx[i]!] as number;
      return out;
    });
    return { channels: s.channels.map((c) => c.pnn), columns, count: idx.length };
  }

  /** Raw values of one channel (used for e.g. logicle W suggestion and range defaults). */
  async channelValues(
    ctx: AnalysisContext,
    sampleId: string,
    axis: { channel: string; comp: CompRef },
    popId: string,
    max = 200_000,
  ): Promise<Float64Array> {
    const s = await this.sample(sampleId);
    const col = this.column(ctx, s, { ...axis, transform: null });
    const idx = toIndices(this.popBits(ctx, s, popId));
    const step = Math.max(1, Math.floor(idx.length / max));
    const out = new Float64Array(Math.ceil(idx.length / step));
    for (let i = 0, k = 0; i < idx.length; i += step, k++) out[k] = col[idx[i]!] as number;
    return out;
  }

  get cacheBytes(): number {
    return this.cache.bytes;
  }
}

/** In-memory storage (tests, and browsers without OPFS). */
export class MemoryStorage implements StorageAdapter {
  private data = new Map<string, SampleData>();
  put(s: SampleData): void {
    this.data.set(s.sampleId, s);
  }
  async loadSample(id: string): Promise<SampleData> {
    const s = this.data.get(id);
    if (!s) throw new Error(`Sample ${id} is not loaded`);
    return s;
  }
}
