/**
 * Population statistics (methods M-STAT-*; docs/methods/statistics.md).
 *
 * Definitions:
 *  - mean: Neumaier-compensated sum / n.
 *  - sd: sample standard deviation (n − 1 denominator), two-pass.
 *  - cv: 100 · sd / mean (%).
 *  - median: middle order statistic; mean of the two middle values for even n
 *    (as numpy.median).
 *  - percentile p: Hyndman & Fan (1996) type 7 / numpy "linear" method,
 *    h = (n − 1)·p/100, interpolated with numpy's two-sided lerp.
 *  - rsd (robust SD, FlowJo): (P84.13 − P15.87) / 2.
 *  - rcv (robust CV, FlowJo): 100 · rsd / median (%).
 *  - geomMean: exp(mean(ln x)) over x > 0; non-positive values are excluded
 *    and reported in n_excluded. (FlowJo instead computes the geometric mean
 *    "in graph space"; see the methods page.)
 *
 * NaN values (e.g. log10 of non-positive data, M-TR-LOGNP) are excluded from
 * every statistic and counted in n_excluded.
 */

export type ValueStat =
  | 'mean'
  | 'median'
  | 'geomMean'
  | 'sd'
  | 'cv'
  | 'rsd'
  | 'rcv'
  | 'percentile'
  | 'min'
  | 'max';

export interface StatValue {
  value: number;
  /** Values used. */
  n: number;
  /** Values excluded (NaN, or ≤ 0 for geomMean). */
  nExcluded: number;
}

/** Neumaier compensated summation. */
export function sum(xs: ArrayLike<number>): number {
  let s = 0;
  let c = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] as number;
    const t = s + x;
    if (Math.abs(s) >= Math.abs(x)) c += s - t + x;
    else c += x - t + s;
    s = t;
  }
  return s + c;
}

export function mean(xs: ArrayLike<number>): number {
  return xs.length === 0 ? Number.NaN : sum(xs) / xs.length;
}

/** Sample SD (n − 1), two-pass with compensated sums. */
export function sd(xs: ArrayLike<number>): number {
  const n = xs.length;
  if (n < 2) return Number.NaN;
  const m = mean(xs);
  let s = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const d = (xs[i] as number) - m;
    const x = d * d;
    const t = s + x;
    if (Math.abs(s) >= Math.abs(x)) c += s - t + x;
    else c += x - t + s;
    s = t;
  }
  return Math.sqrt((s + c) / (n - 1));
}

/** numpy's _lerp: a + (b−a)·t, evaluated from b for t ≥ 0.5 (monotone and exact at the ends). */
function lerp(a: number, b: number, t: number): number {
  const d = b - a;
  return t >= 0.5 ? b - d * (1 - t) : a + d * t;
}

/** Percentile (0–100) of ascending-sorted values, numpy "linear" method. */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const q = p / 100;
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  if (lo >= n - 1) return sorted[n - 1] as number;
  if (lo < 0) return sorted[0] as number;
  const g = h - lo;
  return lerp(sorted[lo] as number, sorted[lo + 1] as number, g);
}

export function medianSorted(sorted: ArrayLike<number>): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const h = n >>> 1;
  return n % 2 === 1 ? (sorted[h] as number) : ((sorted[h - 1] as number) + (sorted[h] as number)) / 2;
}

/** Copy of the finite (non-NaN) values. */
export function dropNaN(xs: ArrayLike<number>): Float64Array {
  let k = 0;
  for (let i = 0; i < xs.length; i++) if (!Number.isNaN(xs[i] as number)) k++;
  if (k === xs.length) return Float64Array.from(xs);
  const out = new Float64Array(k);
  k = 0;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i] as number;
    if (!Number.isNaN(v)) out[k++] = v;
  }
  return out;
}

/**
 * Compute several statistics on one population's values for one channel.
 * Sorting happens at most once.
 */
export function summarize(
  values: ArrayLike<number>,
  requests: { stat: ValueStat; p?: number }[],
): StatValue[] {
  const clean = dropNaN(values);
  const nanCount = values.length - clean.length;
  let sorted: Float64Array | null = null;
  const getSorted = () => {
    if (!sorted) {
      sorted = Float64Array.from(clean);
      sorted.sort();
    }
    return sorted;
  };
  const n = clean.length;
  const base = (value: number): StatValue => ({ value, n, nExcluded: nanCount });
  return requests.map(({ stat, p }) => {
    switch (stat) {
      case 'mean':
        return base(mean(clean));
      case 'sd':
        return base(sd(clean));
      case 'cv':
        return base((100 * sd(clean)) / mean(clean));
      case 'median':
        return base(medianSorted(getSorted()));
      case 'percentile':
        if (p === undefined || !(p >= 0 && p <= 100))
          throw new RangeError('percentile requires p in [0, 100]');
        return base(percentileSorted(getSorted(), p));
      case 'rsd': {
        const s = getSorted();
        return base((percentileSorted(s, 84.13) - percentileSorted(s, 15.87)) / 2);
      }
      case 'rcv': {
        const s = getSorted();
        const rsd = (percentileSorted(s, 84.13) - percentileSorted(s, 15.87)) / 2;
        return base((100 * rsd) / medianSorted(s));
      }
      case 'min':
        return base(n === 0 ? Number.NaN : (getSorted()[0] as number));
      case 'max':
        return base(n === 0 ? Number.NaN : (getSorted()[n - 1] as number));
      case 'geomMean': {
        let k = 0;
        const logs = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const v = clean[i] as number;
          if (v > 0) logs[k++] = Math.log(v);
        }
        return {
          value: k === 0 ? Number.NaN : Math.exp(mean(logs.subarray(0, k))),
          n: k,
          nExcluded: nanCount + (n - k),
        };
      }
    }
  });
}

/** Population frequency statistics. */
export function frequencies(
  count: number,
  parentCount: number,
  grandparentCount: number,
  totalCount: number,
) {
  const pct = (a: number, b: number) => (b === 0 ? Number.NaN : (100 * a) / b);
  return {
    count,
    pctParent: pct(count, parentCount),
    pctGrandparent: pct(count, grandparentCount),
    pctTotal: pct(count, totalCount),
  };
}
