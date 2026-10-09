import type { Sample } from '@flowmeris/model';

/**
 * Types of the compute worker's API (ADR-0010) that are not already Engine method types. The worker
 * (apps/web/src/workers/compute.worker.ts) passes Engine's own parameter types through, and the
 * WorkerPool calls it through Comlink with them, so a signature is written once, here or in Engine.
 */

/** What ingesting one FCS file gives: its samples (one per dataset), file hash, and whether OPFS kept them. */
export interface IngestResult {
  samples: Sample[];
  sha256: string;
  persisted: boolean;
}

/** Gated events exported as stored (raw linear) or compensated. */
export type EventsMode = 'raw' | 'compensated';

/** File format of exported gated events. */
export type EventsFormat = 'fcs' | 'csv';
