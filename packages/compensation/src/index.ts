/**
 * Compensation (methods M-COMP-*; docs/methods/compensation.md).
 *
 * Model (Bagwell & Adams 1993; Roederer 2001; Gating-ML 2.0 "spectrumMatrix"):
 * observed detector signals o (1×n) arise from true fluorochrome signals t via
 * o = t · S, where row i of the spillover matrix S is the fraction of
 * fluorochrome i's signal seen in each detector (S_ii = 1 for a normalized
 * matrix). Compensated values are therefore t = o · S⁻¹.
 *
 * Channels that are not part of the matrix pass through unchanged.
 */

export interface SpilloverMatrix {
  /** Detector ($PnN) names in matrix order. */
  detectors: string[];
  /** Row-major n×n spillover values. */
  spill: number[][];
}

export class CompensationError extends Error {}

/** Spillover keywords in order of precedence (FCS 3.1 $SPILLOVER; legacy $SPILL / SPILL). */
export const SPILLOVER_KEYWORDS = ['$SPILLOVER', '$SPILL', 'SPILL', 'SPILLOVER', '$COMP', 'COMP'] as const;

/**
 * Parse a $SPILLOVER-style keyword value: "n,det1,…,detn,s11,s12,…,snn".
 * Returns null for an empty matrix (n = 0).
 */
export function parseSpilloverKeyword(value: string): SpilloverMatrix | null {
  const parts = value.split(',').map((s) => s.trim());
  const n = Number.parseInt(parts[0] ?? '', 10);
  if (!Number.isFinite(n) || n < 0)
    throw new CompensationError(`Malformed spillover keyword: "${value.slice(0, 40)}…"`);
  if (n === 0) return null;
  if (parts.length !== 1 + n + n * n) {
    throw new CompensationError(
      `Spillover keyword declares ${n} detectors but has ${parts.length - 1} fields (expected ${n + n * n})`,
    );
  }
  const detectors = parts.slice(1, 1 + n);
  const spill: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const v = Number(parts[1 + n + i * n + j]);
      if (!Number.isFinite(v))
        throw new CompensationError(`Non-numeric spillover value at (${i + 1}, ${j + 1})`);
      row.push(v);
    }
    spill.push(row);
  }
  return { detectors, spill };
}

/** First spillover matrix found in the keywords (see SPILLOVER_KEYWORDS), with the keyword name. */
export function findSpillover(
  keywords: Record<string, string>,
): { keyword: string; matrix: SpilloverMatrix } | null {
  for (const k of SPILLOVER_KEYWORDS) {
    const v = keywords[k];
    if (v === undefined) continue;
    const m = parseSpilloverKeyword(v);
    if (m) return { keyword: k, matrix: m };
  }
  return null;
}

/** Serialize to $SPILLOVER keyword format. */
export function formatSpilloverKeyword(m: SpilloverMatrix): string {
  return [String(m.detectors.length), ...m.detectors, ...m.spill.flat().map((v) => String(v))].join(',');
}

/**
 * Parse a CSV/TSV matrix: first non-comment row = detector names, followed by
 * n rows of n numbers (FlowKit/FlowJo export layout). Lines starting with '#'
 * before the data are treated as a header if no other header is found.
 */
export function parseMatrixCsv(text: string): SpilloverMatrix {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const split = (l: string) => l.split(/[,\t]/).map((s) => s.trim());
  let headerIdx = lines.findIndex((l) => !l.startsWith('#') && split(l).some((c) => Number.isNaN(Number(c))));
  let detectors: string[];
  if (headerIdx === -1) {
    headerIdx = lines.findIndex((l) => l.startsWith('#'));
    if (headerIdx === -1) throw new CompensationError('Matrix CSV has no header row of detector names');
    detectors = split(lines[headerIdx]!.replace(/^#\s*/, ''));
  } else detectors = split(lines[headerIdx]!);
  const rows = lines.slice(headerIdx + 1).map((l) => split(l).map(Number));
  const n = detectors.length;
  if (rows.length !== n || rows.some((r) => r.length !== n || r.some((v) => !Number.isFinite(v)))) {
    throw new CompensationError(`Matrix CSV must contain ${n} rows of ${n} numbers after the header`);
  }
  return { detectors, spill: rows };
}

// ---------------------------------------------------------------------------
// Linear algebra (float64, LU with partial pivoting — same algorithm family as
// LAPACK getrf/getri used by NumPy).
// ---------------------------------------------------------------------------

export function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((r) => {
    if (r.length !== n) throw new CompensationError('Matrix must be square');
    return Float64Array.from(r);
  });
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(a[k]![k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i]![k]!);
      if (v > max) {
        max = v;
        p = i;
      }
    }
    if (max === 0) throw new CompensationError('Spillover matrix is singular');
    if (p !== k) {
      [a[p], a[k]] = [a[k]!, a[p]!];
      [perm[p], perm[k]] = [perm[k]!, perm[p]!];
    }
    const akk = a[k]![k]!;
    for (let i = k + 1; i < n; i++) {
      const f = a[i]![k]! / akk;
      a[i]![k] = f;
      for (let j = k + 1; j < n; j++) a[i]![j] = a[i]![j]! - f * a[k]![j]!;
    }
  }
  // Solve A X = P·I column by column.
  const inv = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const y = new Float64Array(n);
  for (let col = 0; col < n; col++) {
    for (let i = 0; i < n; i++) {
      let s = perm[i] === col ? 1 : 0;
      for (let j = 0; j < i; j++) s -= a[i]![j]! * y[j]!;
      y[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i]!;
      for (let j = i + 1; j < n; j++) s -= a[i]![j]! * inv[j]![col]!;
      inv[i]![col] = s / a[i]![i]!;
    }
  }
  return inv;
}

function norm1(m: number[][]): number {
  let best = 0;
  for (let j = 0; j < m.length; j++) {
    let s = 0;
    for (let i = 0; i < m.length; i++) s += Math.abs(m[i]![j]!);
    if (s > best) best = s;
  }
  return best;
}

/** 1-norm condition number κ₁(S) = ‖S‖₁·‖S⁻¹‖₁. */
export function conditionNumber(m: number[][]): number {
  return norm1(m) * norm1(invert(m));
}

/** Warn above this condition number (M-COMP-COND). */
export const CONDITION_WARN = 1e3;

export interface Compensator {
  matrix: SpilloverMatrix;
  inverse: number[][];
  /** Column indices (into the sample's channel list) of each matrix detector. */
  channelIndex: number[];
  condition: number;
}

/**
 * Prepare compensation for a sample's channels. Detector names are matched to
 * $PnN exactly; if that fails, case-insensitively.
 */
export function makeCompensator(matrix: SpilloverMatrix, channelNames: string[]): Compensator {
  const channelIndex = matrix.detectors.map((d) => {
    let i = channelNames.indexOf(d);
    if (i < 0) i = channelNames.findIndex((c) => c.toLowerCase() === d.toLowerCase());
    if (i < 0) throw new CompensationError(`Matrix detector "${d}" not found among sample channels`);
    return i;
  });
  if (new Set(channelIndex).size !== channelIndex.length)
    throw new CompensationError('Matrix lists a detector twice');
  const inverse = invert(matrix.spill);
  return { matrix, inverse, channelIndex, condition: norm1(matrix.spill) * norm1(inverse) };
}

/**
 * Compensated value of one detector column for all events:
 * t_j = Σ_i o_i · (S⁻¹)_{i j}, where o_i are the matrix detectors' linear values.
 * `columns` are the sample's linearized channel columns (full channel list).
 * Returns null if `channel` is not a matrix detector (pass-through).
 */
export function compensateChannel(
  comp: Compensator,
  columns: ArrayLike<number>[],
  channel: number,
  out?: Float64Array,
): Float64Array | null {
  const j = comp.channelIndex.indexOf(channel);
  if (j < 0) return null;
  const n = (columns[channel] as ArrayLike<number>).length;
  const res = out ?? new Float64Array(n);
  const k = comp.channelIndex.length;
  const coef = comp.inverse.map((row) => row[j]!);
  const src = comp.channelIndex.map((ci) => columns[ci] as ArrayLike<number>);
  res.fill(0);
  // Accumulate in matrix-row order i = 0..k−1 (same order as a dot product).
  for (let i = 0; i < k; i++) {
    const c = coef[i]!;
    if (c === 0) continue;
    const s = src[i]!;
    for (let e = 0; e < n; e++) res[e] = res[e]! + (s[e] as number) * c;
  }
  return res;
}
