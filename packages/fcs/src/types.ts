export type FcsDataType = 'I' | 'F' | 'D' | 'A';
export type ChannelKind = 'scatter' | 'fluor' | 'time' | 'other';

export interface FcsWarning {
  /** Stable quirk/warning code, documented in docs/methods/fcs.md. */
  code: string;
  message: string;
}

export interface FcsHeader {
  version: string;
  textStart: number;
  textEnd: number;
  dataStart: number;
  dataEnd: number;
  analysisStart: number;
  analysisEnd: number;
}

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

export interface FcsChannel {
  /** 1-based parameter number. */
  n: number;
  pnn: string;
  pns?: string;
  /** $PnB as number of bits, or '*' for delimited ASCII. */
  pnb: number | '*';
  pnr: number;
  pne: [number, number];
  png?: number;
  dataType: FcsDataType;
  kind: ChannelKind;
  scaling: ChannelScaling;
}

export interface FcsDataset {
  /** Index of this dataset within the file ($NEXTDATA chain). */
  index: number;
  /** Byte offset of this dataset's HEADER within the file. */
  offset: number;
  header: FcsHeader;
  /** Keywords with upper-cased names; values as written. */
  keywords: Record<string, string>;
  channels: FcsChannel[];
  eventCount: number;
  /**
   * Stored (pre-scaling) channel values, one column per channel. Float32 where
   * that representation is exact (integers ≤ 24 bits, single-precision
   * floats), Float64 otherwise. Apply `linearize()` to obtain data values.
   */
  columns: (Float32Array | Float64Array)[];
  warnings: FcsWarning[];
}

export interface FcsFile {
  datasets: FcsDataset[];
}

export class FcsParseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'FcsParseError';
  }
}
