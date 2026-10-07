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

function swap(a: Float64Array, i: number, j: number): void {
  const t = a[i] as number;
  a[i] = a[j] as number;
  a[j] = t;
}

/**
 * Floyd–Rivest selection (Floyd & Rivest 1975, algorithm SELECT): rearranges
 * a[lo..hi] so that a[k] holds the value it would have if the range were
 * sorted, with every element left of k ≤ a[k] ≤ every element right of it.
 * Large ranges are first narrowed by recursively selecting within a small
 * sample around the expected position, which makes the pivot nearly exact.
 * Expected ~n + min(k, n − k) comparisons; if partitioning ever stalls on
 * adversarial input, the remaining range is sorted instead.
 */
function select(a: Float64Array, lo: number, hi: number, k: number): void {
  let l = lo;
  let r = hi;
  let budget = 4 * Math.ceil(Math.log2(hi - lo + 2)) + 16;
  while (r > l) {
    if (budget-- === 0) {
      a.subarray(l, r + 1).sort();
      return;
    }
    if (r - l > 600) {
      const n = r - l + 1;
      const m = k - l + 1;
      const z = Math.log(n);
      const s = 0.5 * Math.exp((2 * z) / 3);
      const sd = 0.5 * Math.sqrt((z * s * (n - s)) / n) * (m - n / 2 < 0 ? -1 : 1);
      select(
        a,
        Math.max(l, Math.floor(k - (m * s) / n + sd)),
        Math.min(r, Math.floor(k + ((n - m) * s) / n + sd)),
        k,
      );
    }
    const t = a[k] as number;
    let i = l;
    let j = r;
    swap(a, l, k);
    if ((a[r] as number) > t) swap(a, l, r);
    while (i < j) {
      swap(a, i, j);
      i++;
      j--;
      while ((a[i] as number) < t) i++;
      while ((a[j] as number) > t) j--;
    }
    if (a[l] === t) swap(a, l, j);
    else {
      j++;
      swap(a, j, r);
    }
    if (j <= k) l = j + 1;
    if (k <= j) r = j - 1;
  }
}

/** Places every rank of `ranks` (ascending, distinct) at its sorted position in a[lo..hi]. */
function selectRanks(a: Float64Array, ranks: number[], lo: number, hi: number, rlo: number, rhi: number) {
  if (rlo > rhi || lo > hi) return;
  const m = (rlo + rhi) >>> 1;
  const k = ranks[m] as number;
  select(a, lo, hi, k);
  selectRanks(a, ranks, lo, k - 1, rlo, m - 1);
  selectRanks(a, ranks, k + 1, hi, m + 1, rhi);
}

/** The order-statistic ranks percentileSorted(·, p) reads for n values. */
function percentileRanks(n: number, p: number): number[] {
  if (n === 0) return [];
  const lo = Math.floor((n - 1) * (p / 100));
  if (lo >= n - 1) return [n - 1];
  if (lo < 0) return [0];
  return [lo, lo + 1];
}

/** The order-statistic ranks medianSorted reads for n values. */
function medianRanks(n: number): number[] {
  if (n === 0) return [];
  const h = n >>> 1;
  return n % 2 === 1 ? [h] : [h - 1, h];
}

/** Above this many distinct ranks a full sort is cheaper than repeated selection. */
const MAX_SELECT_RANKS = 32;

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

// ---------------------------------------------------------------------------
// Replicate summaries (M-STAT-AGG; docs/methods/statistics.md)
// ---------------------------------------------------------------------------

/** Standard error of the mean, SD / √n (n ≥ 2). */
export function sem(xs: ArrayLike<number>): number {
  return sd(xs) / Math.sqrt(xs.length);
}

/**
 * ln Γ(x) for x a positive multiple of ½ (all the t distribution needs), by
 * the recurrence Γ(x) = (x − 1)·Γ(x − 1) down to Γ(1) = 1 or Γ(½) = √π. Exact
 * up to rounding, unlike the usual Lanczos series (~1e-8 relative).
 */
function lnGammaHalf(x: number): number {
  let s = 0;
  let y = x;
  while (y > 1) {
    y -= 1;
    s += Math.log(y);
  }
  return y === 1 ? s : s + 0.5 * Math.log(Math.PI);
}

/** Continued fraction of the regularised incomplete beta function (modified Lentz). */
function betaCf(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b), for a and b positive multiples of ½. */
function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = lnGammaHalf(a + b) - lnGammaHalf(a) - lnGammaHalf(b) + a * Math.log(x) + b * Math.log(1 - x);
  return x < (a + 1) / (a + b + 2)
    ? (Math.exp(lbt) * betaCf(a, b, x)) / a
    : 1 - (Math.exp(lbt) * betaCf(b, a, 1 - x)) / b;
}

/** P(T > t) for t ≥ 0, Student's t with `df` degrees of freedom (no 1 − p cancellation). */
function tUpper(t: number, df: number): number {
  return 0.5 * betaInc(df / (df + t * t), df / 2, 0.5);
}

/** Student's t cumulative distribution function with `df` (integer) degrees of freedom. */
export function tCdf(t: number, df: number): number {
  const tail = tUpper(Math.abs(t), df);
  return t >= 0 ? 1 - tail : tail;
}

/** Quantile of Student's t distribution (0 < p < 1), by bisection on the upper tail. */
export function tQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0) || !Number.isInteger(df)) return Number.NaN;
  if (p === 0.5) return 0;
  if (p < 0.5) return -tQuantile(1 - p, df);
  const q = 1 - p;
  let lo = 0;
  let hi = 1;
  while (tUpper(hi, df) > q) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-14 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (tUpper(mid, df) > q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Half-width of the two-sided 95% confidence interval of the mean: t₀.₉₇₅,ₙ₋₁ · SEM. */
export function ci95HalfWidth(xs: ArrayLike<number>): number {
  return xs.length < 2 ? Number.NaN : tQuantile(0.975, xs.length - 1) * sem(xs);
}
