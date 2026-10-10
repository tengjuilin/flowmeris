/**
 * Decoded event data of a sample, as the compute workers hold it and browser storage keeps it. Types
 * only: `@flowmeris/fcs` produces it, `@flowmeris/engine` computes from it and `@flowmeris/storage`
 * stores it.
 */

/** How stored channel values map to linear data values (M-FCS-LIN). */
export interface ChannelScaling {
  /** $PnE f1 (decades); 0 = linear. */
  logDecades: number;
  /** $PnE f2 (value at channel 0); 1.0 substituted when f1>0 and f2=0 (Q-PNE-ZERO-F2). */
  logOffset: number;
  /** $PnR. */
  range: number;
  /** Divisor applied after log decoding ($PnG, or 1). Forced to 1 for the time channel. */
  gain: number;
  /** Multiplier applied to the time channel ($TIMESTEP), else 1. */
  timestep: number;
}

/** Event data for one dataset of one FCS file, as held by a worker. */
export interface SampleData {
  sampleId: string;
  sha256: string;
  datasetIndex: number;
  eventCount: number;
  channels: { pnn: string; scaling: ChannelScaling }[];
  /**
   * Stored (pre-linearisation) columns. A column may be null until it is first
   * needed when the sample was opened lazily (see `loadColumn`).
   */
  columns: (Float32Array | Float64Array | null)[];
  keywords: Record<string, string>;
  /** Reads one stored column; present when `columns` may hold unloaded (null) entries. */
  loadColumn?: (ci: number) => Promise<Float32Array | Float64Array>;
}

/** Where a worker obtains sample data (OPFS in the browser, memory in tests). */
export interface StorageAdapter {
  loadSample(sampleId: string): Promise<SampleData>;
}
