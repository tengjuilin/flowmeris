/** Percentiles and the median by numpy's "linear" method, from a sort or a selection of ranks. */

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
export function selectRanks(
  a: Float64Array,
  ranks: number[],
  lo: number,
  hi: number,
  rlo: number,
  rhi: number,
) {
  if (rlo > rhi || lo > hi) return;
  const m = (rlo + rhi) >>> 1;
  const k = ranks[m] as number;
  select(a, lo, hi, k);
  selectRanks(a, ranks, lo, k - 1, rlo, m - 1);
  selectRanks(a, ranks, k + 1, hi, m + 1, rhi);
}

/** The order-statistic ranks percentileSorted(·, p) reads for n values. */
export function percentileRanks(n: number, p: number): number[] {
  if (n === 0) return [];
  const lo = Math.floor((n - 1) * (p / 100));
  if (lo >= n - 1) return [n - 1];
  if (lo < 0) return [0];
  return [lo, lo + 1];
}

/** The order-statistic ranks medianSorted reads for n values. */
export function medianRanks(n: number): number[] {
  if (n === 0) return [];
  const h = n >>> 1;
  return n % 2 === 1 ? [h] : [h - 1, h];
}

/** Above this many distinct ranks a full sort is cheaper than repeated selection. */
export const MAX_SELECT_RANKS = 32;
