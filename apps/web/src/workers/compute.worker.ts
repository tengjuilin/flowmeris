import {
  type AnalysisContext,
  Engine,
  type GatePreviewRequest,
  MemoryStorage,
  type RasterRequest,
  type SampleData,
  type StatSpec,
  type StorageAdapter,
  sampleDataFromDataset,
  sampleMetaFromDataset,
} from '@flowmeris/engine';
/// <reference lib="webworker" />
import { parseFcs, writeFcs } from '@flowmeris/fcs';
import type { AxisSpec, PlotStyle, Sample } from '@flowmeris/model';
import { OpfsStorage } from '@flowmeris/storage';
import * as Comlink from 'comlink';

/**
 * Compute worker. Each worker owns a subset of samples (ADR-0003), holds an
 * Engine with its own byte-budgeted caches, and persists decoded columns to
 * OPFS (falling back to memory when OPFS is unavailable).
 */

const memory = new MemoryStorage();
let opfs: OpfsStorage | null = null;
const ready = OpfsStorage.available().then((ok) => {
  if (ok) opfs = new OpfsStorage();
  return ok;
});

const storage: StorageAdapter = {
  async loadSample(id: string): Promise<SampleData> {
    await ready;
    try {
      return await memory.loadSample(id);
    } catch {
      if (!opfs)
        throw new Error(`Sample ${id} is not loaded (browser storage unavailable); re-add the FCS file.`);
      return opfs.loadSample(id);
    }
  },
};

const engine = new Engine(storage, { cacheBytes: 256 * 2 ** 20, sampleBytes: 384 * 2 ** 20 });

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface IngestResult {
  samples: Sample[];
  sha256: string;
  persisted: boolean;
}

const api = {
  async init(budgetBytes: number) {
    engine.setBudgets(Math.floor(budgetBytes * 0.4), Math.floor(budgetBytes * 0.6));
    return { opfs: await ready };
  },

  /** Hash, parse and persist one FCS file (all datasets). */
  async ingest(file: File, relativePath: string): Promise<IngestResult> {
    const buf = await file.arrayBuffer();
    const sha256 = await sha256Hex(buf);
    const parsed = parseFcs(new Uint8Array(buf));
    await ready;
    const samples: Sample[] = [];
    let persisted = false;
    for (const ds of parsed.datasets) {
      const data = sampleDataFromDataset(ds, sha256);
      engine.putSample(data);
      if (opfs) {
        try {
          if (!(await opfs.has(data.sampleId))) await opfs.save(data);
          persisted = true;
        } catch {
          memory.put(data);
        }
      } else memory.put(data);
      samples.push(sampleMetaFromDataset(ds, { name: file.name, relativePath, size: file.size, sha256 }));
    }
    return { samples, sha256, persisted };
  },

  async hasSample(id: string): Promise<boolean> {
    await ready;
    try {
      await memory.loadSample(id);
      return true;
    } catch {
      return opfs ? opfs.has(id) : false;
    }
  },

  async raster(ctx: AnalysisContext, req: RasterRequest) {
    const r = await engine.raster(ctx, req);
    return Comlink.transfer(r, [r.rgba.buffer]);
  },

  async histogram(ctx: AnalysisContext, sampleId: string, popId: string, axis: AxisSpec, style: PlotStyle) {
    const h = await engine.histogram(ctx, sampleId, popId, axis, style);
    return Comlink.transfer(h, [h.centers.buffer, h.heights.buffer]);
  },

  counts(ctx: AnalysisContext, sampleId: string, popIds: string[]) {
    return engine.counts(ctx, sampleId, popIds);
  },

  stats(ctx: AnalysisContext, sampleId: string, specs: StatSpec[]) {
    return engine.stats(ctx, sampleId, specs);
  },

  preview(ctx: AnalysisContext, req: GatePreviewRequest) {
    return engine.preview(ctx, req);
  },

  channelValues(
    ctx: AnalysisContext,
    sampleId: string,
    axis: { channel: string; comp: 'group' | 'uncompensated' },
    popId: string,
  ) {
    return engine.channelValues(ctx, sampleId, axis, popId);
  },

  /** Gated events as an FCS 3.1 file (raw linear values + original keywords) or CSV text. */
  async exportEvents(
    ctx: AnalysisContext,
    sampleId: string,
    popId: string,
    mode: 'raw' | 'compensated',
    format: 'fcs' | 'csv',
    provenance: Record<string, string>,
  ): Promise<Uint8Array> {
    const ev = await engine.populationEvents(ctx, sampleId, popId, mode);
    const s = await engine.sample(sampleId);
    if (format === 'csv') {
      const lines = [ev.channels.map((c) => JSON.stringify(c)).join(',')];
      for (let i = 0; i < ev.count; i++) lines.push(ev.columns.map((c) => String(c[i])).join(','));
      return new TextEncoder().encode(`${lines.join('\n')}\n`);
    }
    // Compensated values must not carry a spillover matrix (it would be applied twice).
    const dropped = mode === 'compensated' ? new Set(['$SPILLOVER', '$SPILL', 'SPILL']) : new Set<string>();
    const kw: Record<string, string> = Object.fromEntries(
      Object.entries(s.keywords).filter(([k]) => !dropped.has(k)),
    );
    Object.assign(kw, provenance);
    const bytes = writeFcs(
      ev.channels.map((pnn, i) => ({
        pnn,
        ...(s.keywords[`$P${i + 1}S`] ? { pns: s.keywords[`$P${i + 1}S`] } : {}),
        values: ev.columns[i]!,
      })),
      { keywords: kw },
    );
    return Comlink.transfer(bytes, [bytes.buffer]);
  },

  cacheBytes() {
    return engine.cacheBytes;
  },
};

export type ComputeApi = typeof api;
Comlink.expose(api);
