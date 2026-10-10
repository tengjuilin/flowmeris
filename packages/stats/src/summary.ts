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

import {
  MAX_SELECT_RANKS,
  dropNaN,
  medianRanks,
  medianSorted,
  percentileRanks,
  percentileSorted,
  selectRanks,
} from './percentile.ts';

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

/**
 * Compute several statistics on one population's values for one channel.
 * Order statistics (median, percentiles, robust SD/CV, min, max) come from
 * selection of just the ranks they read, so the values are exactly those of
 * a full sort; sorting happens only when many ranks are requested.
 * With `owned`, the caller hands over `values` (a Float64Array it no longer
 * needs), which is then reordered in place instead of copied.
 */
export function summarize(
  values: ArrayLike<number>,
  requests: { stat: ValueStat; p?: number }[],
  owned = false,
): StatValue[] {
  const clean =
    owned && values instanceof Float64Array && !values.some(Number.isNaN) ? values : dropNaN(values);
  const nanCount = values.length - clean.length;
  const n = clean.length;
  const base = (value: number): StatValue => ({ value, n, nExcluded: nanCount });
  const out: StatValue[] = new Array(requests.length);

  // Order-dependent statistics first, while `clean` is still in event order.
  const ranks = new Set<number>();
  requests.forEach(({ stat, p }, i) => {
    switch (stat) {
      case 'mean':
        out[i] = base(mean(clean));
        break;
      case 'sd':
        out[i] = base(sd(clean));
        break;
      case 'cv':
        out[i] = base((100 * sd(clean)) / mean(clean));
        break;
      case 'geomMean': {
        let k = 0;
        const logs = new Float64Array(n);
        for (let j = 0; j < n; j++) {
          const v = clean[j] as number;
          if (v > 0) logs[k++] = Math.log(v);
        }
        out[i] = {
          value: k === 0 ? Number.NaN : Math.exp(mean(logs.subarray(0, k))),
          n: k,
          nExcluded: nanCount + (n - k),
        };
        break;
      }
      case 'median':
        for (const r of medianRanks(n)) ranks.add(r);
        break;
      case 'percentile':
        if (p === undefined || !(p >= 0 && p <= 100))
          throw new RangeError('percentile requires p in [0, 100]');
        for (const r of percentileRanks(n, p)) ranks.add(r);
        break;
      case 'rsd':
      case 'rcv':
        for (const r of [...percentileRanks(n, 84.13), ...percentileRanks(n, 15.87)]) ranks.add(r);
        if (stat === 'rcv') for (const r of medianRanks(n)) ranks.add(r);
        break;
      case 'min':
        if (n > 0) ranks.add(0);
        break;
      case 'max':
        if (n > 0) ranks.add(n - 1);
        break;
    }
  });
  // Reorder so every needed rank sits at its sorted position; the *Sorted
  // helpers below read only those positions.
  const s = clean;
  if (ranks.size > MAX_SELECT_RANKS) s.sort();
  else if (ranks.size > 0)
    selectRanks(
      s,
      [...ranks].sort((a, b) => a - b),
      0,
      n - 1,
      0,
      ranks.size - 1,
    );
  requests.forEach(({ stat, p }, i) => {
    switch (stat) {
      case 'median':
        out[i] = base(medianSorted(s));
        break;
      case 'percentile':
        out[i] = base(percentileSorted(s, p as number));
        break;
      case 'rsd':
        out[i] = base((percentileSorted(s, 84.13) - percentileSorted(s, 15.87)) / 2);
        break;
      case 'rcv': {
        const rsd = (percentileSorted(s, 84.13) - percentileSorted(s, 15.87)) / 2;
        out[i] = base((100 * rsd) / medianSorted(s));
        break;
      }
      case 'min':
        out[i] = base(n === 0 ? Number.NaN : (s[0] as number));
        break;
      case 'max':
        out[i] = base(n === 0 ? Number.NaN : (s[n - 1] as number));
        break;
      default:
        break;
    }
  });
  return out;
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

/** Standard error of the mean, SD / √n (n ≥ 2). */
export function sem(xs: ArrayLike<number>): number {
  return sd(xs) / Math.sqrt(xs.length);
}
