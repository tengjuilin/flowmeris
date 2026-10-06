import type {
  AnalysisContext,
  GatePreviewRequest,
  HistogramResponse,
  PopulationCount,
  RasterRequest,
  RasterResponse,
  StatSpec,
} from '@flowmeris/engine';
import type { AxisSpec, PlotStyle } from '@flowmeris/model';
import * as Comlink from 'comlink';
import type { ComputeApi, IngestResult } from '../workers/compute.worker.ts';

/**
 * Options for plot requests (raster, histogram, counts).
 *
 * `key` must identify the result completely (everything it depends on, e.g. lib/analysis plotKey
 * plus the raster size and colours): results are then kept in a client-side cache and identical
 * concurrent requests share one computation. Cached results are shared, so callers must not mutate them.
 *
 * `signal` drops the request if it is aborted while still queued (e.g. a tile scrolled out of view).
 */
export interface RequestOptions {
  key?: string;
  signal?: AbortSignal;
}

/** Plot requests in flight per worker; the rest wait in a queue where they can still be cancelled. */
const IN_FLIGHT_PER_WORKER = 2;
/** Byte budget of the client-side plot result cache. */
const RESULT_CACHE_BYTES = 96 * 2 ** 20;

interface Job {
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  /** Callers still waiting for the result; a queued job nobody waits for is dropped. */
  waiters: number;
  started: boolean;
}

function abortError(): Error {
  return new DOMException('Request cancelled', 'AbortError');
}

function resultBytes(v: unknown): number {
  const r = v as Partial<RasterResponse & HistogramResponse>;
  let n = 256;
  if (r.rgba) n += r.rgba.byteLength;
  if (r.centers) n += r.centers.byteLength;
  if (r.heights) n += r.heights.byteLength;
  for (const c of r.contours ?? []) for (const ring of c.rings) n += ring.length * 40;
  return n;
}

/** Byte-budgeted LRU of finished plot results (Map preserves insertion order; re-insert on hit). */
class ResultCache {
  private map = new Map<string, { value: unknown; bytes: number }>();
  private used = 0;

  get(key: string): unknown {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: unknown): void {
    const old = this.map.get(key);
    if (old) {
      this.used -= old.bytes;
      this.map.delete(key);
    }
    const bytes = resultBytes(value);
    this.map.set(key, { value, bytes });
    this.used += bytes;
    for (const [k, e] of this.map) {
      if (this.used <= RESULT_CACHE_BYTES || this.map.size <= 1) break;
      this.map.delete(k);
      this.used -= e.bytes;
    }
  }
}

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
  private queues: Job[][] = [];
  private active: number[] = [];
  private results = new ResultCache();
  private pending = new Map<string, { job: Job; promise: Promise<unknown> }>();

  constructor() {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.size = Math.max(1, Math.min(cores - 1, 6));
    const budget = Math.floor((1536 * 2 ** 20) / this.size);
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(new URL('../workers/compute.worker.ts', import.meta.url), { type: 'module' });
      this.workers.push(Comlink.wrap<ComputeApi>(w));
      this.queues.push([]);
      this.active.push(0);
    }
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
    return this.results.get(key) as T | undefined;
  }

  /** Queue a plot request on a sample's worker, sharing and caching results by `opts.key`. */
  private schedule<T>(sampleId: string, run: () => Promise<T>, opts: RequestOptions = {}): Promise<T> {
    const { key, signal } = opts;
    if (signal?.aborted) return Promise.reject(abortError());
    if (key !== undefined) {
      const hit = this.results.get(key);
      if (hit !== undefined) return Promise.resolve(hit as T);
    }
    const shared = key !== undefined ? this.pending.get(key) : undefined;
    let job: Job;
    let promise: Promise<unknown>;
    if (shared) {
      ({ job, promise } = shared);
      job.waiters++;
    } else {
      let resolve!: (v: unknown) => void;
      let reject!: (e: unknown) => void;
      promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      job = { run, resolve, reject, waiters: 1, started: false };
      const wi = this.index(sampleId);
      if (key !== undefined) {
        this.pending.set(key, { job, promise });
        promise.then(
          (v) => {
            this.pending.delete(key);
            this.results.set(key, v);
          },
          () => this.pending.delete(key),
        );
      }
      this.queues[wi]!.push(job);
      this.pump(wi);
    }
    if (!signal) return promise as Promise<T>;
    // Each caller gets its own promise so one caller's cancellation does not reject the others.
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        job.waiters--;
        if (job.waiters === 0 && !job.started) job.reject(abortError());
        reject(abortError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (v) => {
          signal.removeEventListener('abort', onAbort);
          resolve(v as T);
        },
        (e) => {
          signal.removeEventListener('abort', onAbort);
          reject(e);
        },
      );
    });
  }

  private pump(wi: number): void {
    const q = this.queues[wi]!;
    while (this.active[wi]! < IN_FLIGHT_PER_WORKER && q.length > 0) {
      const job = q.shift()!;
      if (job.waiters === 0) continue; // cancelled while queued (already rejected)
      job.started = true;
      this.active[wi]!++;
      job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active[wi]!--;
          this.pump(wi);
        });
    }
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
    style: PlotStyle,
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
  stats(ctx: AnalysisContext, sampleId: string, specs: StatSpec[]) {
    return this.w(sampleId).stats(ctx, sampleId, specs);
  }
  /** Counts and statistics of one sample in a single round trip (Statistics table). */
  table(ctx: AnalysisContext, sampleId: string, popIds: string[], specs: StatSpec[]) {
    return this.w(sampleId).table(ctx, sampleId, popIds, specs);
  }
  preview(ctx: AnalysisContext, req: GatePreviewRequest) {
    return this.w(req.sampleId).preview(ctx, req);
  }
  channelValues(
    ctx: AnalysisContext,
    sampleId: string,
    axis: { channel: string; comp: 'group' | 'uncompensated' },
    popId: string,
  ) {
    return this.w(sampleId).channelValues(ctx, sampleId, axis, popId);
  }
  exportEvents(
    ctx: AnalysisContext,
    sampleId: string,
    popId: string,
    mode: 'raw' | 'compensated',
    format: 'fcs' | 'csv',
    provenance: Record<string, string>,
  ) {
    return this.w(sampleId).exportEvents(ctx, sampleId, popId, mode, format, provenance);
  }
}

export const pool = new WorkerPool();
