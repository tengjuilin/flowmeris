import {
  type AnalysisContext,
  Engine,
  type EventsFormat,
  type EventsMode,
  type IngestResult,
  MemoryStorage,
  type SampleData,
  type StorageAdapter,
  sampleDataFromDataset,
  sampleMetaFromDataset,
} from '@flowmeris/engine';
/// <reference lib="webworker" />
import { eventsToCsv, eventsToFcs } from '@flowmeris/export';
import { parseFcs } from '@flowmeris/fcs';
import type { Sample } from '@flowmeris/model';
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

async function sha256Buffer(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parameters are Engine's own (ADR-0010): methods that only pass through take `...a:
 * Parameters<Engine[m]>`. Results with large buffers are transferred, not copied.
 */
const api = {
  async init(budgetBytes: number) {
    engine.setBudgets(Math.floor(budgetBytes * 0.4), Math.floor(budgetBytes * 0.6));
    return { opfs: await ready };
  },

  /** Hash, parse and persist one FCS file (all datasets). */
  async ingest(file: File, relativePath: string): Promise<IngestResult> {
    const buf = await file.arrayBuffer();
    const sha256 = await sha256Buffer(buf);
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

  async raster(...a: Parameters<Engine['raster']>) {
    const r = await engine.raster(...a);
    return Comlink.transfer(r, [r.rgba.buffer]);
  },

  async histogram(...a: Parameters<Engine['histogram']>) {
    const h = await engine.histogram(...a);
    return Comlink.transfer(h, [h.centers.buffer, h.heights.buffer]);
  },

  counts: (...a: Parameters<Engine['counts']>) => engine.counts(...a),
  table: (...a: Parameters<Engine['table']>) => engine.table(...a),
  preview: (...a: Parameters<Engine['preview']>) => engine.preview(...a),
  channelValues: (...a: Parameters<Engine['channelValues']>) => engine.channelValues(...a),

  /** Gated events as an FCS 3.1 file (raw linear values + original keywords) or CSV text. */
  async exportEvents(
    ctx: AnalysisContext,
    sampleId: string,
    popId: string,
    mode: EventsMode,
    format: EventsFormat,
    provenance: Record<string, string>,
  ): Promise<Uint8Array> {
    const ev = await engine.populationEvents(ctx, sampleId, popId, mode);
    if (format === 'csv') return new TextEncoder().encode(eventsToCsv(ev));
    const s = await engine.sample(sampleId);
    const bytes = eventsToFcs(s.keywords, ev, mode, provenance);
    return Comlink.transfer(bytes, [bytes.buffer]);
  },
};

export type ComputeApi = typeof api;
Comlink.expose(api);
