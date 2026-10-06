import type { AnalysisContext, GatePreviewRequest, RasterRequest, StatSpec } from '@flowmeris/engine';
import type { AxisSpec, PlotStyle } from '@flowmeris/model';
import * as Comlink from 'comlink';
import type { ComputeApi, IngestResult } from '../workers/compute.worker.ts';

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

  constructor() {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.size = Math.max(1, Math.min(cores - 1, 6));
    const budget = Math.floor((1536 * 2 ** 20) / this.size);
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(new URL('../workers/compute.worker.ts', import.meta.url), { type: 'module' });
      this.workers.push(Comlink.wrap<ComputeApi>(w));
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

  private w(sampleId: string) {
    const i = this.owner.get(sampleId) ?? this.hash(sampleId);
    return this.workers[i]!;
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
  raster(ctx: AnalysisContext, req: RasterRequest) {
    return this.w(req.sampleId).raster(ctx, req);
  }
  histogram(ctx: AnalysisContext, sampleId: string, popId: string, axis: AxisSpec, style: PlotStyle) {
    return this.w(sampleId).histogram(ctx, sampleId, popId, axis, style);
  }
  counts(ctx: AnalysisContext, sampleId: string, popIds: string[]) {
    return this.w(sampleId).counts(ctx, sampleId, popIds);
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
