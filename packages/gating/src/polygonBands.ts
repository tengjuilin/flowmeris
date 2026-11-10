import type { PreparedPolygon } from './geometry.ts';

/**
 * A polygon's edges indexed by horizontal band, so the M-GATE-POLY winding test of a point looks only at
 * the edges that can count for its y. The bands lie between consecutive distinct vertex y values
 * `bandY`; band j is [bandY[j], bandY[j + 1]) and lists (in `edges`, from `start[j]` to `start[j + 1]`)
 * the edges whose half-open y-interval [min(ay, by), max(ay, by)) covers it.
 *
 * The winding test counts an edge only when ay ≤ y < by or by ≤ y < ay. As both ends of an edge are
 * vertex y values, that holds for a y in band j exactly when the edge covers the whole band; a y at or
 * above the highest vertex y is counted by no edge. Edges with a NaN end never count (every comparison
 * with NaN is false, or the cross product is NaN). So running the unchanged test on the band's edges
 * gives the winding count of the full loop, bit for bit.
 */
export interface PolygonBands {
  poly: PreparedPolygon;
  bandY: Float64Array;
  start: Int32Array;
  edges: Int32Array;
}

/** Upper bound on band–edge entries; above it `polygonBands` returns null and the full loop is used. */
const MAX_ENTRIES = 1 << 22;

/** The index of the last element of the ascending `a` that is ≤ y (−1 when none). */
function lastAtMost(a: Float64Array, y: number): number {
  let lo = -1;
  let hi = a.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((a[mid] as number) <= y) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The band index of a polygon (see PolygonBands), or null when it would be too large. */
export function polygonBands(poly: PreparedPolygon): PolygonBands | null {
  const { xs, ys } = poly;
  const n = xs.length;
  const sorted = Float64Array.from(ys.filter((v) => !Number.isNaN(v))).sort();
  let k = 0;
  for (let i = 0; i < sorted.length; i++)
    if (k === 0 || (sorted[i] as number) !== (sorted[k - 1] as number)) sorted[k++] = sorted[i] as number;
  const bandY = sorted.slice(0, k);
  const nb = Math.max(k - 1, 0);
  // Each edge covers a contiguous run of bands [first, last); count the entries per band.
  const first = new Int32Array(n);
  const last = new Int32Array(n);
  const start = new Int32Array(nb + 1);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const ay = ys[i] as number;
    const by = ys[i >= n - 1 ? 0 : i + 1] as number;
    if (!(ay !== by) || Number.isNaN(ay) || Number.isNaN(by)) continue;
    const f = lastAtMost(bandY, Math.min(ay, by));
    const l = lastAtMost(bandY, Math.max(ay, by));
    first[i] = f;
    last[i] = l;
    for (let j = f; j < l; j++) start[j + 1] = (start[j + 1] as number) + 1;
    total += l - f;
    if (total > MAX_ENTRIES) return null;
  }
  for (let j = 0; j < nb; j++) start[j + 1] = (start[j + 1] as number) + (start[j] as number);
  const edges = new Int32Array(total);
  const fill = start.slice(0, nb);
  for (let i = 0; i < n; i++)
    for (let j = first[i] as number; j < (last[i] as number); j++) {
      edges[fill[j] as number] = i;
      fill[j] = (fill[j] as number) + 1;
    }
  return { poly, bandY, start, edges };
}

/**
 * M-GATE-POLY through the band index: the same result as `inPolygon(b.poly, x, y)` (NaN and the bounding
 * box rejected first, then the crossing-number parity of the winding count), testing only the edges of
 * the band holding y.
 */
export function inPolygonBands(b: PolygonBands, x: number, y: number): boolean {
  const p = b.poly;
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) return false;
  const j = lastAtMost(b.bandY, y);
  if (j < 0 || j >= b.start.length - 1) return false;
  const { xs, ys } = p;
  const n = xs.length;
  const edges = b.edges;
  let wind = 0;
  for (let e = b.start[j] as number, end = b.start[j + 1] as number; e < end; e++) {
    const i = edges[e] as number;
    const ax = xs[i] as number;
    const ay = ys[i] as number;
    const k = i >= n - 1 ? 0 : i + 1;
    const bx = xs[k] as number;
    const by = ys[k] as number;
    if (ay <= y) {
      if (y < by) {
        const isLeft = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
        if (isLeft > 0) wind += 1;
      }
    } else if (by <= y) {
      const isLeft = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
      if (isLeft < 0) wind -= 1;
    }
  }
  return wind % 2 !== 0;
}
