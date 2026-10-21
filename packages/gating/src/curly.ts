/**
 * Curly quadrant gate (M-GATE-CURLY; docs/methods/gating.md): a quadrant gate whose upper and right legs
 * curve away from Q2 by photon-counting spread, as FlowJo's curly quad.
 */

type XY = [number, number];
type Path = readonly (readonly [number, number])[];

/** One gate dimension's mapping between gate units and linear data units (identity for raw dims). */
export interface CurlyAxis {
  toLinear(v: number): number;
  fromLinear(v: number): number;
}

/** Vertices per curved leg, the center included. */
export const CURLY_VERTICES = 49;

const sqrt0 = (v: number) => Math.sqrt(Math.max(v, 0));

/**
 * The leg of a curly quadrant that runs along `along` from the center to `top` (gate units), its other
 * coordinate moved by a·(√V − √C) in linear data units, V the linear value along the leg and C the
 * center's. `along` 0 is the right leg (x rises, y curves up), 1 the upper leg (y rises, x curves right).
 * Vertices are evenly spaced along the leg in gate units; a vertex whose curved coordinate is not finite
 * keeps the previous one's.
 */
export function curlyLeg(
  center: readonly [number, number],
  a: number,
  along: 0 | 1,
  axes: readonly [CurlyAxis, CurlyAxis],
  top: number,
): XY[] {
  const across = along === 0 ? 1 : 0;
  const s = axes[along];
  const t = axes[across];
  const c0 = center[along];
  const c1 = center[across];
  const C0 = sqrt0(s.toLinear(c0));
  const C1 = t.toLinear(c1);
  const end = top > c0 ? top : c0 + Math.max(1e-3, Math.abs(c0) * 0.05);
  const out: XY[] = [[center[0], center[1]]];
  let prev = c1;
  for (let i = 1; i < CURLY_VERTICES; i++) {
    const v = c0 + ((end - c0) * i) / (CURLY_VERTICES - 1);
    const w = t.fromLinear(C1 + a * (sqrt0(s.toLinear(v)) - C0));
    const u = Number.isFinite(w) ? Math.max(w, prev) : prev;
    prev = u;
    out.push(along === 0 ? [v, u] : [u, v]);
  }
  return out;
}

/**
 * Curliness `a` that puts the leg running along `along` through `p`'s other coordinate at `p`'s
 * coordinate along it (0 when `p` is at or behind the center). Inverse of curlyLeg at one point.
 */
export function curlinessThrough(
  center: readonly [number, number],
  along: 0 | 1,
  axes: readonly [CurlyAxis, CurlyAxis],
  p: readonly [number, number],
): number {
  const across = along === 0 ? 1 : 0;
  const s = axes[along];
  const t = axes[across];
  const run = sqrt0(s.toLinear(p[along])) - sqrt0(s.toLinear(center[along]));
  const rise = t.toLinear(p[across]) - t.toLinear(center[across]);
  const a = run > 0 ? rise / run : 0;
  return Number.isFinite(a) && a > 0 ? a : 0;
}

/**
 * Whether (x, y) is left of the upper leg `up` (strictly; on the leg is right). `up` starts at the
 * center with rising y; above its last vertex the leg goes straight up. Cross products as in inPolygon.
 */
function leftOfUp(up: Path, x: number, y: number): boolean {
  const n = up.length;
  const last = up[n - 1]!;
  if (y >= last[1]) return x < last[0];
  let lo = 0;
  let hi = n - 1;
  // up[lo][1] ≤ y < up[hi][1]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (up[mid]![1] <= y) lo = mid;
    else hi = mid;
  }
  const [ax, ay] = up[lo]!;
  const [bx, by] = up[hi]!;
  return (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0;
}

/**
 * Whether (x, y) is on or above the right leg `right`, which starts at the center with rising x; right
 * of its last vertex the leg goes straight right.
 */
function onOrAboveRight(right: Path, x: number, y: number): boolean {
  const n = right.length;
  const last = right[n - 1]!;
  if (x >= last[0]) return y >= last[1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (right[mid]![0] <= x) lo = mid;
    else hi = mid;
  }
  const [ax, ay] = right[lo]!;
  const [bx, by] = right[hi]!;
  return (bx - ax) * (y - ay) - (x - ax) * (by - ay) >= 0;
}

/**
 * M-GATE-CURLY: the region of (x, y) in a curly quadrant. Below the center's y the straight legs decide
 * (Q4 left of cx, Q3 at or right of it). At or above it, an event left of the upper leg is Q1; otherwise
 * it is Q2 on or above the right leg and Q3 below it. Every non-NaN event is in exactly one region.
 *
 * Returns 1–4 (Q1–Q4) or 0 for NaN input.
 */
export function curlyRegion(
  center: readonly [number, number],
  up: Path,
  right: Path,
  x: number,
  y: number,
): 0 | 1 | 2 | 3 | 4 {
  if (Number.isNaN(x) || Number.isNaN(y)) return 0;
  if (y < center[1]) return x < center[0] ? 4 : 3;
  if (leftOfUp(up, x, y)) return 1;
  return onOrAboveRight(right, x, y) ? 2 : 3;
}

/**
 * Null when a curly quadrant's legs are well formed: each starts at the center, `up` has strictly
 * rising y and `right` strictly rising x, neither bends back toward Q1/Q3, and no vertex of one leg is
 * on the far side of the other (the legs do not cross). Otherwise the reason.
 */
export function validateCurly(center: readonly [number, number], up: Path, right: Path): string | null {
  const [cx, cy] = center;
  if (up.length < 2 || right.length < 2) return 'Curly quadrant legs need two vertices';
  if (up[0]![0] !== cx || up[0]![1] !== cy || right[0]![0] !== cx || right[0]![1] !== cy)
    return 'Curly quadrant legs must start at the center';
  for (let i = 1; i < up.length; i++)
    if (!(up[i]![1] > up[i - 1]![1]) || !(up[i]![0] >= up[i - 1]![0]))
      return 'The upper leg must rise and bend right';
  for (let i = 1; i < right.length; i++)
    if (!(right[i]![0] > right[i - 1]![0]) || !(right[i]![1] >= right[i - 1]![1]))
      return 'The right leg must run right and bend up';
  for (let i = 1; i < up.length; i++) {
    const [x, y] = up[i]!;
    if (x > cx && !onOrAboveRight(right, x, y)) return 'The legs cross; make them less curly';
  }
  for (let i = 1; i < right.length; i++) {
    const [x, y] = right[i]!;
    if (y > cy && leftOfUp(up, x, y)) return 'The legs cross; make them less curly';
  }
  return null;
}
