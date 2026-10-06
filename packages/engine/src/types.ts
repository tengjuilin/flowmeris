import type { ChannelScaling } from '@flowmeris/fcs';
import type { CompMatrix, Gate, Group, PlotSpec, Region, StatSpec, Transform } from '@flowmeris/model';

/** Event data for one dataset of one FCS file, as held by a worker. */
export interface SampleData {
  sampleId: string;
  sha256: string;
  datasetIndex: number;
  eventCount: number;
  channels: { pnn: string; scaling: ChannelScaling }[];
  /** Stored (pre-linearisation) columns. */
  columns: (Float32Array | Float64Array)[];
  keywords: Record<string, string>;
}

/** Where a worker obtains sample data (OPFS in the browser, memory in tests). */
export interface StorageAdapter {
  loadSample(sampleId: string): Promise<SampleData>;
}

/**
 * The slice of the workspace a computation needs. Sent with every request so
 * workers are stateless with respect to the workspace document.
 */
export interface AnalysisContext {
  group: Group;
  transforms: Record<string, Transform>;
  compMatrices: Record<string, CompMatrix>;
}

export interface PopulationCount {
  popId: string;
  count: number;
  parentCount: number;
  grandparentCount: number;
  totalCount: number;
}

export interface StatResult {
  statId: string;
  sampleId: string;
  value: number;
  n: number;
  nExcluded: number;
}

export interface RasterRequest {
  sampleId: string;
  plot: PlotSpec;
  width: number;
  height: number;
  dotColor: string;
}

export interface RasterResponse {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  contours: { level: number; rings: [number, number][][] }[];
  eventsPlotted: number;
  offScale: number;
  nan: number;
  sigmaPx: number;
}

export interface HistogramResponse {
  centers: Float64Array;
  heights: Float64Array;
  eventsPlotted: number;
  offScale: number;
  nan: number;
}

export interface GatePreviewRequest {
  sampleId: string;
  gate: Gate;
}

export interface GatePreviewResponse {
  parentCount: number;
  regions: Partial<Record<Region, number>>;
}

export type { StatSpec };
