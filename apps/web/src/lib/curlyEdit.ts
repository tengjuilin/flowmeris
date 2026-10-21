import { type CurlyAxis, curlinessThrough, curlyLeg, validateCurly } from '@flowmeris/gating';
import type { Gate, Geometry, Workspace } from '@flowmeris/model';
import { scaleFor } from './geometry.ts';

type XY = [number, number];
export type CurlyGeometry = Extract<Geometry, { kind: 'curly' }>;
export type CurlyAxes = readonly [CurlyAxis, CurlyAxis];

const IDENTITY: CurlyAxis = { toLinear: (v) => v, fromLinear: (v) => v };

/** Gate units ↔ linear data units on a gate's two dimensions (identity on a raw dimension). */
export function curlyAxes(ws: Workspace, dims: Gate['dims']): [CurlyAxis, CurlyAxis] {
  const axis = (t: string | null | undefined): CurlyAxis => {
    if (!t) return IDENTITY;
    const s = scaleFor(ws, t);
    return { toLinear: s.inverse, fromLinear: s.apply };
  };
  return [axis(dims[0]?.transform), axis(dims[1]?.transform)];
}

/**
 * How far a new curly quadrant's legs run (gate units): the plot's right and top edges, and at least
 * the top of scale (1) on a transformed dimension, so zooming out later still shows them curving.
 */
export function curlyTop(dims: Gate['dims'], xr: readonly number[], yr: readonly number[]): XY {
  const top = (r: readonly number[], t: string | null | undefined) => {
    const hi = Math.max(r[0]!, r[1]!);
    return t ? Math.max(hi, 1) : hi;
  };
  return [top(xr, dims[0]?.transform), top(yr, dims[1]?.transform)];
}

/** Where a curly quadrant's legs end now: the right leg's last x and the upper leg's last y. */
function topOf(g: CurlyGeometry): XY {
  return [g.right.at(-1)![0], g.up.at(-1)![1]];
}

/** A curly quadrant with `center` and curliness `a` = [up, right], its legs built to `top`. */
export function curlyGeometry(center: XY, a: XY, axes: CurlyAxes, top: XY): CurlyGeometry {
  return {
    kind: 'curly',
    center,
    a,
    up: curlyLeg(center, a[0], 1, axes, top[1]),
    right: curlyLeg(center, a[1], 0, axes, top[0]),
  };
}

/** `curlyGeometry`, its curliness halved until the legs no longer cross (straight legs never do). */
function fitted(center: XY, a: XY, axes: CurlyAxes, top: XY): CurlyGeometry {
  let k = 1;
  for (let i = 0; i < 30; i++, k /= 2) {
    const g = curlyGeometry(center, [a[0] * k, a[1] * k], axes, top);
    if (validateCurly(g.center, g.up, g.right) === null) return g;
  }
  return curlyGeometry(center, [0, 0], axes, top);
}

/**
 * A new curly quadrant at `center`: each curved leg bends 10% of the plot's span away from the
 * center's line by the plot's edge (less if the legs would cross).
 */
export function newCurly(center: XY, axes: CurlyAxes, top: XY, xr: readonly number[], yr: readonly number[]) {
  const dx = 0.1 * Math.abs(xr[1]! - xr[0]!);
  const dy = 0.1 * Math.abs(yr[1]! - yr[0]!);
  const aUp = curlinessThrough(center, 1, axes, [center[0] + dx, top[1]]);
  const aRight = curlinessThrough(center, 0, axes, [top[0], center[1] + dy]);
  return fitted(center, [aUp, aRight], axes, top);
}

/** The curly quadrant moved to `center`, its curliness kept (or reduced if the legs would cross). */
export function curlyAt(g: CurlyGeometry, center: XY, axes: CurlyAxes): CurlyGeometry {
  return fitted(center, [g.a[0], g.a[1]], axes, topOf(g));
}

/** The curly quadrant with curliness `a`; null if its legs would cross. */
export function withCurliness(g: CurlyGeometry, a: XY, axes: CurlyAxes): CurlyGeometry | null {
  const n = curlyGeometry([g.center[0], g.center[1]], a, axes, topOf(g));
  return validateCurly(n.center, n.up, n.right) === null ? n : null;
}

/** Index of the vertex of a curved leg that carries its handle (halfway along it). */
export function handleVertex(leg: readonly unknown[]): number {
  return Math.floor((leg.length - 1) / 2);
}

/**
 * Curly quadrant handle `handle` dragged to `p` (gate units): `c` moves the gate, `up` sets the upper
 * leg's curliness so that the leg passes `p`'s x at its handle's height, `right` the right leg's so it
 * passes `p`'s y at its handle's x. Null when the legs would cross.
 */
export function dragCurly(base: CurlyGeometry, handle: string, p: XY, axes: CurlyAxes): CurlyGeometry | null {
  if (handle === 'c') return curlyAt(base, p, axes);
  const c = base.center;
  if (handle === 'up') {
    const h = base.up[handleVertex(base.up)]!;
    return withCurliness(base, [curlinessThrough(c, 1, axes, [p[0], h[1]]), base.a[1]], axes);
  }
  if (handle === 'right') {
    const h = base.right[handleVertex(base.right)]!;
    return withCurliness(base, [base.a[0], curlinessThrough(c, 0, axes, [h[0], p[1]])], axes);
  }
  return base;
}
