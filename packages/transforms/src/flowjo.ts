import { LogicleParameterError } from './logicle.ts';

/**
 * FlowJo display scales that Gating-ML 2.0 has no element for (ADR-0014): FlowJo's biexponential
 * (M-TR-BIEX) and a Miltenyi-style linear/log hybrid (M-TR-MILTENYI).
 */

/** Channels of FlowJo's biex lookup table; channel 4096 is display value 1. */
export const BIEX_CHANNELS = 4096;

/**
 * Root d of 2·ln d + w·d = 2·ln b − w·b by bracketed Newton/bisection, as in FlowJo's biex code
 * (ported through cytolib and FlowKit's `_log_root`, including its quirks: the first f uses w·b).
 */
function logRoot(b: number, w: number): number {
  let xLo = 0;
  let xHi = b;
  let d = (xLo + xHi) / 2;
  let dx = Math.abs(Math.trunc(xLo - xHi));
  let dxLast = dx;
  const fb = -2 * Math.log(b) + w * b;
  let f = 2 * Math.log(d) + w * b + fb;
  let df = 2 / d + w;
  if (w === 0) return b;
  for (let i = 0; i < 100; i++) {
    if ((d - xHi) * df - f - ((d - xLo) * df - f) > 0 || Math.abs(2 * f) > Math.abs(dxLast * df)) {
      dx = (xHi - xLo) / 2;
      d = xLo + dx;
      if (d === xLo) return d;
    } else {
      dx = f / df;
      const t = d;
      d -= dx;
      if (d === t) return d;
    }
    if (Math.abs(dx) < 1e-12) return d;
    dxLast = dx;
    f = 2 * Math.log(d) + w * d + fb;
    df = 2 / d + w;
    if (f < 0) xLo = d;
    else xHi = d;
  }
  return d;
}

/**
 * FlowJo's biex lookup table (M-TR-BIEX): data values at channels 0…4096, increasing. A port of FlowKit's
 * `generate_biex_lut` (from cytolib, itself from FlowJo's Java code).
 */
export function biexTable(T: number, width: number, pos: number, neg: number): Float64Array {
  const range = BIEX_CHANNELS;
  const w0 = Math.log10(-width);
  let decades = pos - w0 / 2;
  if (!(T > 0) || !(width <= -1) || !(neg >= 0) || !(decades > 0)) {
    throw new LogicleParameterError(
      'Biex: invalid parameters (T > 0, width ≤ −1, neg ≥ 0, pos > log10(−width)/2)',
    );
  }
  const extra = neg + w0 / 2;
  let zero = Math.trunc((extra * range) / (extra + decades));
  zero = Math.trunc(Math.min(zero, range / 2));
  if (zero > 0) decades = (extra * range) / zero;
  const w = w0 / (2 * decades);
  const positiveRange = Math.LN10 * decades;
  const minimum = T / Math.exp(positiveRange);
  const negativeRange = logRoot(positiveRange, w);
  const n = range + 1;
  const positive = new Float64Array(n);
  const negative = new Float64Array(n);
  const s = Math.exp((positiveRange + negativeRange) * (w + extra / decades));
  for (let i = 0; i < n; i++) {
    positive[i] = Math.exp((i / n) * positiveRange);
    negative[i] = Math.exp((i / n) * -negativeRange) * s;
  }
  const shift = positive[zero]! - negative[zero]!;
  for (let i = zero; i < n; i++) positive[i] = minimum * (positive[i]! - negative[i]! - shift);
  for (let i = 0; i < zero; i++) positive[i] = -positive[2 * zero - i]!;
  return positive;
}

/**
 * Linear interpolation in increasing `xs` at `x` with `ys` = channel index, held at the ends: SciPy's
 * `interp1d(kind='linear', bounds_error=False, fill_value=(min, max))`, the same arithmetic.
 */
function interpChannel(xs: Float64Array, x: number): number {
  const n = xs.length;
  if (Number.isNaN(x)) return Number.NaN;
  if (x < xs[0]!) return 0;
  if (x > xs[n - 1]!) return n - 1;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  const j = Math.min(Math.max(lo, 1), n - 1);
  const x0 = xs[j - 1]!;
  const slope = 1 / (xs[j]! - x0);
  return slope * (x - x0) + (j - 1);
}

/** FlowJo's biex scale (M-TR-BIEX): the lookup table read linearly, channel / 4096, held at both ends. */
export class Biex {
  readonly table: Float64Array;
  constructor(T: number, width: number, pos: number, neg: number) {
    this.table = biexTable(T, width, pos, neg);
  }
  scale(x: number): number {
    return interpChannel(this.table, x) / BIEX_CHANNELS;
  }
  inverse(y: number): number {
    const c = y * BIEX_CHANNELS;
    const t = this.table;
    if (Number.isNaN(c)) return Number.NaN;
    if (c <= 0) return t[0]!;
    if (c >= BIEX_CHANNELS) return t[BIEX_CHANNELS]!;
    const j = Math.max(Math.ceil(c), 1);
    const y0 = t[j - 1]!;
    return (t[j]! - y0) * (c - (j - 1)) + y0;
  }
}

/**
 * Miltenyi-style scale (M-TR-MILTENYI) in decades u: u = log10(x/x0) above x0 = T·10^−M, and below x0
 * the tangent line u = (x/x0 − 1)/ln10, so the scale is smooth at x0 and linear through zero and the
 * negatives. f = (u + L)/(M + L) shows L decades of the linear part; T maps to 1.
 */
export class Miltenyi {
  private readonly x0: number;
  private readonly span: number;
  constructor(
    T: number,
    readonly M: number,
    readonly L: number,
  ) {
    if (!(T > 0) || !(M > 0) || !(L >= 0)) {
      throw new LogicleParameterError('Miltenyi: invalid parameters (T > 0, M > 0, L ≥ 0)');
    }
    this.x0 = T * 10 ** -M;
    this.span = M + L;
  }
  scale(x: number): number {
    const u = x >= this.x0 ? Math.log10(x / this.x0) : (x / this.x0 - 1) / Math.LN10;
    return (u + this.L) / this.span;
  }
  inverse(y: number): number {
    const u = y * this.span - this.L;
    return u >= 0 ? this.x0 * 10 ** u : this.x0 * (1 + u * Math.LN10);
  }
}
