import { canonicalJson, sha256Hex } from '@flowmeris/model';
import { BoundedMemo } from './memo.ts';
import type { SampleData, StatSpec } from './types.ts';

/** Bumped whenever a numerical kernel changes, so cached results are not reused (ADR-0004). */
export const KERNEL_VERSION = 'ts-1';

/** Population cache keys computed within one request (a key hashes its whole lineage). */
export type KeyMemo = Map<string, string>;

/** Identifies a sample's data: its file's content hash and the dataset within the file. */
export function sampleKey(s: SampleData): string {
  return `${s.sha256}:${s.datasetIndex}`;
}

/** Cache key of one value statistic: the population's and column's content keys (ADR-0004). */
export const statKey = (bitsKey: string, colKey: string, spec: StatSpec): string =>
  `stat|${KERNEL_VERSION}|${bitsKey}|${colKey}|${spec.stat}|${spec.p ?? ''}`;

/**
 * fingerprint(), memoised on the value's canonical JSON (which is cheap next to SHA-256). Keyed by
 * content rather than object identity: each request arrives as a fresh structured clone.
 */
export class Fingerprints {
  private memo = new BoundedMemo<string>(4096);

  fp(value: unknown): string {
    const json = canonicalJson(value);
    return this.memo.get(json, () => sha256Hex(json).slice(0, 32));
  }
}
