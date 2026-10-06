import type { FcsDataset } from '@flowmeris/fcs';
import type { Sample } from '@flowmeris/model';
import type { SampleData } from './types.ts';

/** Deterministic sample id: the same file content and dataset always gets the same id. */
export function sampleIdFor(sha256: string, datasetIndex: number): string {
  return `s_${sha256.slice(0, 20)}_${datasetIndex}`;
}

export function sampleDataFromDataset(ds: FcsDataset, sha256: string): SampleData {
  return {
    sampleId: sampleIdFor(sha256, ds.index),
    sha256,
    datasetIndex: ds.index,
    eventCount: ds.eventCount,
    channels: ds.channels.map((c) => ({ pnn: c.pnn, scaling: c.scaling })),
    columns: ds.columns,
    keywords: ds.keywords,
  };
}

export function sampleMetaFromDataset(
  ds: FcsDataset,
  file: { name: string; relativePath: string; size: number; sha256: string },
): Sample {
  return {
    id: sampleIdFor(file.sha256, ds.index),
    fileName: file.name,
    relativePath: file.relativePath,
    sha256: file.sha256,
    byteSize: file.size,
    datasetIndex: ds.index,
    fcsVersion: ds.header.version,
    eventCount: ds.eventCount,
    keywords: ds.keywords,
    channels: ds.channels.map((c) => ({
      n: c.n,
      pnn: c.pnn,
      ...(c.pns !== undefined ? { pns: c.pns } : {}),
      pnb: c.pnb,
      pne: c.pne,
      ...(c.png !== undefined ? { png: c.png } : {}),
      pnr: c.pnr,
      dataType: c.dataType,
      kind: c.kind,
    })),
    parseWarnings: ds.warnings,
  };
}
