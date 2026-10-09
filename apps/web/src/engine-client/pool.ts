import type {
  AnalysisContext,
  Engine,
  EventsFormat,
  EventsMode,
  GatePreviewRequest,
  HistogramResponse,
  IngestResult,
  PopulationCount,
  RasterRequest,
  RasterResponse,
  StatSpec,
} from '@flowmeris/engine';
import type { AxisSpec } from '@flowmeris/model';
import * as Comlink from 'comlink';
import type { ComputeApi } from '../workers/compute.worker.ts';
import { type RequestOptions, Scheduler } from './scheduler.ts';

export type { RequestOptions };

/** Plot requests in flight per worker; the rest wait in a queue where they can still be cancelled. */
const IN_FLIGHT_PER_WORKER = 2;
/** Byte budget of the client-side plot result cache. */
const RESULT_CACHE_BYTES = 96 * 2 ** 20;

type HistogramStyle = Parameters<Engine['histogram']>[4];
type ChannelRef = Parameters<Engine['channelValues']>[2];

/**
 * Pool of compute workers. A sample is pinned to one worker (ADR-0003): the
 * worker that ingested it in this session, otherwise hash(sampleId) mod N.
 */
class WorkerPool {
  private workers: Comlink.Remote<ComputeApi>[] = [];
  private owner = new Map<string, number>();
  private next = 0;
  readonly size: number;
  opfs = false;
  private ready: Promise<void>;
  private scheduler: Scheduler;

  constructor() {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.size = Math.max(1, Math.min(cores - 1, 6));
    const budget = Math.floor((1536 * 2 ** 20) / this.size);
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(new URL('../workers/compute.worker.ts', import.meta.url), { type: 'module' });
      this.workers.push(Comlink.wrap<ComputeApi>(w));
    }
    this.scheduler = new Scheduler(this.size, IN_FLIGHT_PER_WORKER, RESULT_CACHE_BYTES);
    this.ready = Promise.all(this.workers.map((w) => w.init(budget))).then((r) => {
      this.opfs = r.every((x) => x.opfs);
    });
  }

  whenReady() {
    return this.ready;
  }

  private hash(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return (h >>> 0) % this.size;
  }

  private index(sampleId: string): number {
    return this.owner.get(sampleId) ?? this.hash(sampleId);
  }

  private w(sampleId: string) {
    return this.workers[this.index(sampleId)]!;
  }

  /** A finished plot result for `key`, if cached (lets a remounted plot draw without a round trip). */
  cached<T>(key: string): T | undefined {
    return this.scheduler.cached<T>(key);
  }

  /** Queue a plot request on a sample's worker, sharing and caching results by `opts.key`. */
  private schedule<T>(sampleId: string, run: () => Promise<T>, opts?: RequestOptions): Promise<T> {
    return this.scheduler.schedule(this.index(sampleId), run, opts);
  }

  async ingest(file: File, relativePath: string): Promise<IngestResult> {
    const i = this.next++ % this.size;
    const r = await this.workers[i]!.ingest(file, relativePath);
    for (const s of r.samples) this.owner.set(s.id, i);
    return r;
  }

  hasSample(id: string) {
    return this.w(id).hasSample(id);
  }
  raster(ctx: AnalysisContext, req: RasterRequest, opts?: RequestOptions): Promise<RasterResponse> {
    return this.schedule(req.sampleId, () => this.w(req.sampleId).raster(ctx, req), opts);
  }
  histogram(
    ctx: AnalysisContext,
    sampleId: string,
    popId: string,
    axis: AxisSpec,
    style: HistogramStyle,
    opts?: RequestOptions,
  ): Promise<HistogramResponse> {
    return this.schedule(sampleId, () => this.w(sampleId).histogram(ctx, sampleId, popId, axis, style), opts);
  }
  counts(
    ctx: AnalysisContext,
    sampleId: string,
    popIds: string[],
    opts?: RequestOptions,
  ): Promise<PopulationCount[]> {
    return this.schedule(sampleId, () => this.w(sampleId).counts(ctx, sampleId, popIds), opts);
  }
  /** Counts and statistics of one sample in a single round trip (Statistics table). */
  table(ctx: AnalysisContext, sampleId: string, popIds: string[], specs: StatSpec[]) {
    return this.w(sampleId).table(ctx, sampleId, popIds, specs);
  }
  preview(ctx: AnalysisContext, req: GatePreviewRequest) {
    return this.w(req.sampleId).preview(ctx, req);
  }
  channelValues(ctx: AnalysisContext, sampleId: string, axis: ChannelRef, popId: string) {
    return this.w(sampleId).channelValues(ctx, sampleId, axis, popId);
  }
  exportEvents(
    ctx: AnalysisContext,
    sampleId: string,
    popId: string,
    mode: EventsMode,
    format: EventsFormat,
    provenance: Record<string, string>,
  ) {
    return this.w(sampleId).exportEvents(ctx, sampleId, popId, mode, format, provenance);
  }
}

/** The pool's public methods; tests can give `setPool` an object with these. */
export type ComputePool = { [K in keyof WorkerPool]: WorkerPool[K] };

let instance: ComputePool | undefined;

/** The worker pool, started on first use. */
export function getPool(): ComputePool {
  instance ??= new WorkerPool();
  return instance;
}

/** Replace the pool (tests), or with undefined forget it so the next getPool() starts a new one. */
export function setPool(p: ComputePool | undefined) {
  instance = p;
}
