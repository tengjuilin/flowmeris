import type { HistogramResponse, RasterResponse } from '@flowmeris/engine';

/**
 * The worker pool's request queue: per-worker queues with a limit on requests in flight, cancellation
 * of queued requests, sharing of identical requests and a byte-budgeted cache of their results. It runs
 * any async function, so it is tested in Node without workers.
 */

/**
 * Options for plot requests (raster, histogram, counts).
 *
 * `key` must identify the result completely (everything it depends on, e.g. lib/keys plotKey
 * plus the raster size and colors): results are then kept in a client-side cache and identical
 * concurrent requests share one computation. Cached results are shared, so callers must not mutate them.
 *
 * `signal` drops the request if it is aborted while still queued (e.g. a tile scrolled out of view).
 */
export interface RequestOptions {
  key?: string;
  signal?: AbortSignal;
}

interface Job {
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  /** Callers still waiting for the result; a queued job nobody waits for is dropped. */
  waiters: number;
  started: boolean;
}

function abortError(): Error {
  return new DOMException('Request canceled', 'AbortError');
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
export class ResultCache {
  constructor(private budget: number) {}

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
      if (this.used <= this.budget || this.map.size <= 1) break;
      this.map.delete(k);
      this.used -= e.bytes;
    }
  }
}

export class Scheduler {
  private queues: Job[][];
  private active: number[];
  private results: ResultCache;
  private pending = new Map<string, { job: Job; promise: Promise<unknown> }>();

  constructor(
    workers: number,
    private inFlight: number,
    cacheBytes: number,
  ) {
    this.queues = Array.from({ length: workers }, () => []);
    this.active = Array.from({ length: workers }, () => 0);
    this.results = new ResultCache(cacheBytes);
  }

  /** A finished result for `key`, if cached. */
  cached<T>(key: string): T | undefined {
    return this.results.get(key) as T | undefined;
  }

  /**
   * Run `run` on worker `wi` in turn: at most `inFlight` jobs per worker at once, the rest queued (and
   * dropped when every caller aborted). With `opts.key`, a finished result is cached and identical
   * concurrent requests share one job.
   */
  schedule<T>(wi: number, run: () => Promise<T>, opts: RequestOptions = {}): Promise<T> {
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
      if (key !== undefined) {
        this.pending.set(key, { job, promise });
        promise.then(
          (v) => {
            if (this.pending.get(key)?.job === job) this.pending.delete(key);
            this.results.set(key, v);
          },
          () => {
            if (this.pending.get(key)?.job === job) this.pending.delete(key);
          },
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
        if (job.waiters === 0 && !job.started) {
          // Forget the job now, not in a later microtask: a caller re-requesting the same key right
          // away (e.g. an effect re-run) must get a fresh job, not join this rejected one.
          if (key !== undefined && this.pending.get(key)?.job === job) this.pending.delete(key);
          job.reject(abortError());
        }
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
    while (this.active[wi]! < this.inFlight && q.length > 0) {
      const job = q.shift()!;
      if (job.waiters === 0) continue; // canceled while queued (already rejected)
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
}
