import type { SpilloverMatrix } from '@flowmeris/compensation';
import type { Bitset } from '@flowmeris/gating';
import type { AxisSpec, CompRef } from '@flowmeris/model';
import type { EventsMode } from './api.ts';
import { Columns } from './columns.ts';
import { channelValuesOf, eventsOf } from './handlers/events.ts';
import { previewOf } from './handlers/preview.ts';
import { type HistogramStyle, histogramOf, rasterOf } from './handlers/raster.ts';
import { statDims, statsOf } from './handlers/stats.ts';
import { Fingerprints, type KeyMemo } from './keys.ts';
import { LruCache } from './lru.ts';
import type { Cached } from './memo.ts';
import { Populations } from './populations.ts';
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

export { KERNEL_VERSION } from './keys.ts';

export interface EngineOptions {
  /** Byte budget for cached columns and bitsets. */
  cacheBytes?: number;
  /** Byte budget for loaded sample data. */
  sampleBytes?: number;
}

/**
 * The analysis engine for the samples a worker owns. All results are derived
 * from content fingerprints of their inputs, so a cache hit is always valid
 * and nothing needs explicit invalidation.
 *
 * Each request loads the sample and the columns it reads (`Columns`), then computes from them:
 * population membership in `Populations`, the rest in `handlers/`.
 */
export class Engine {
  private cache: LruCache<Cached>;
  private columns: Columns;
  private pops: Populations;

  constructor(storage: StorageAdapter, opts: EngineOptions = {}) {
    this.cache = new LruCache<Cached>(opts.cacheBytes ?? 512 * 2 ** 20, (v) => v.byteLength);
    const keys = new Fingerprints();
    this.columns = new Columns(storage, this.cache, keys, opts.sampleBytes ?? 512 * 2 ** 20);
    this.pops = new Populations(this.cache, this.columns, keys);
  }

  setBudgets(cacheBytes: number, sampleBytes: number): void {
    this.cache.setBudget(cacheBytes);
    this.columns.setBudget(sampleBytes);
  }

  /** Register in-memory sample data (e.g. right after ingest). */
  putSample(s: SampleData): void {
    this.columns.putSample(s);
  }

  sample(id: string): Promise<SampleData> {
    return this.columns.sample(id);
  }

  // -------------------------------------------------------------------------
  // Columns
  // -------------------------------------------------------------------------

  linear(s: SampleData, ci: number): Float64Array {
    return this.columns.linear(s, ci);
  }

  /** The spillover matrix the group's compensation setting resolves to for this sample (null = none). */
  resolveComp(ctx: AnalysisContext, s: SampleData): SpilloverMatrix | null {
    return this.columns.resolveComp(ctx, s);
  }

  compKey(ctx: AnalysisContext, s: SampleData): string {
    return this.columns.compKey(ctx, s);
  }

  /** Linear values of a channel after the group's compensation (pass-through for non-matrix channels). */
  compensated(ctx: AnalysisContext, s: SampleData, ci: number): Float64Array {
    return this.columns.compensated(ctx, s, ci);
  }

  /** Values of a channel in a dimension's space: compensation, then transform (null = linear). */
  column(
    ctx: AnalysisContext,
    s: SampleData,
    dim: { channel: string; comp: CompRef; transform: string | null },
  ): Float64Array {
    return this.columns.column(ctx, s, dim);
  }

  // -------------------------------------------------------------------------
  // Populations
  // -------------------------------------------------------------------------

  /**
   * Cache key of a population's membership for a sample (ADR-0004). Pass one `memo` across the
   * calls of a single request so each ancestor's key is hashed once, not once per descendant.
   */
  popKey(ctx: AnalysisContext, s: SampleData, popId: string, memo: KeyMemo = new Map()): string {
    return this.pops.key(ctx, s, popId, memo);
  }

  popBits(ctx: AnalysisContext, s: SampleData, popId: string, memo: KeyMemo = new Map()): Bitset {
    return this.pops.bits(ctx, s, popId, memo);
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
    return this.pops.indices(ctx, s, popId, memo);
  }

  async counts(ctx: AnalysisContext, sampleId: string, popIds: string[]): Promise<PopulationCount[]> {
    const s = await this.sample(sampleId);
    await this.columns.ensure(ctx, s, popIds);
    return this.pops.counts(ctx, s, popIds, new Map());
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  async stats(ctx: AnalysisContext, sampleId: string, specs: StatSpec[]): Promise<StatResult[]> {
    const s = await this.sample(sampleId);
    await this.ensureStatColumns(ctx, s, [], specs);
    return statsOf(this.cache, this.columns, this.pops, ctx, s, specs, new Map());
  }

  private ensureStatColumns(ctx: AnalysisContext, s: SampleData, popIds: string[], specs: StatSpec[]) {
    return this.columns.ensure(ctx, s, [...popIds, ...specs.map((sp) => sp.population)], statDims(specs));
  }

  /** Population counts and statistics of one sample in a single request (the Statistics table). */
  async table(
    ctx: AnalysisContext,
    sampleId: string,
    popIds: string[],
    specs: StatSpec[],
  ): Promise<{ counts: PopulationCount[]; stats: StatResult[] }> {
    const s = await this.sample(sampleId);
    await this.ensureStatColumns(ctx, s, popIds, specs);
    const memo: KeyMemo = new Map();
    return {
      counts: this.pops.counts(ctx, s, popIds, memo),
      stats: statsOf(this.cache, this.columns, this.pops, ctx, s, specs, memo),
    };
  }

  // -------------------------------------------------------------------------
  // Plots
  // -------------------------------------------------------------------------

  async raster(ctx: AnalysisContext, req: RasterRequest): Promise<RasterResponse> {
    const s = await this.sample(req.sampleId);
    const plot = req.plot;
    if (plot.kind === 'histogram' || !plot.y) throw new Error('raster() needs a 2D plot');
    await this.columns.ensure(ctx, s, [plot.population], [plot.x, plot.y]);
    return rasterOf(this.columns, this.pops, ctx, s, req);
  }

  async histogram(
    ctx: AnalysisContext,
    sampleId: string,
    popId: string,
    axis: AxisSpec,
    style: HistogramStyle,
  ): Promise<HistogramResponse> {
    const s = await this.sample(sampleId);
    await this.columns.ensure(ctx, s, [popId], [axis]);
    return histogramOf(this.columns, this.pops, ctx, s, popId, axis, style);
  }

  /** Counts a gate would produce on a sample, without committing it (live drag preview). */
  async preview(ctx: AnalysisContext, req: GatePreviewRequest): Promise<GatePreviewResponse> {
    const s = await this.sample(req.sampleId);
    await this.columns.ensure(ctx, s, [req.gate.parentPop], req.gate.dims);
    return previewOf(this.columns, this.pops, ctx, s, req.gate);
  }

  /** Event values of a population for export, in linear (compensated or not) or transformed units. */
  async populationEvents(
    ctx: AnalysisContext,
    sampleId: string,
    popId: string,
    mode: EventsMode,
  ): Promise<{ channels: string[]; columns: Float64Array[]; count: number }> {
    const s = await this.sample(sampleId);
    await this.columns.ensure(ctx, s, [popId]);
    await this.columns.load(
      s,
      s.channels.map((_, ci) => ci),
    );
    return eventsOf(this.columns, this.pops, ctx, s, popId, mode);
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
    await this.columns.ensure(ctx, s, [popId], [axis]);
    return channelValuesOf(this.columns, this.pops, ctx, s, axis, popId, max);
  }

  get cacheBytes(): number {
    return this.cache.bytes;
  }
}
