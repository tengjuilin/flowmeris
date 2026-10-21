import { ellipseAxes, ellipseFromAxes, quadrantDividers, validateSpider } from '@flowmeris/gating';
import type { Gate, Geometry, PlotSpec } from '@flowmeris/model';

type XY = [number, number];

/** A gate moved by (dx, dy) in gate units; open rectangle sides stay open. */
export function translate(g: Geometry, dx: number, dy: number): Geometry {
  switch (g.kind) {
    case 'rect':
      return {
        ...g,
        min: g.min.map((v, i) => (v === null ? null : v + (i === 0 ? dx : dy))),
        max: g.max.map((v, i) => (v === null ? null : v + (i === 0 ? dx : dy))),
      };
    case 'polygon':
      return { ...g, vertices: g.vertices.map(([x, y]) => [x + dx, y + dy]) };
    case 'ellipse':
      return { ...g, mean: [g.mean[0] + dx, g.mean[1] + dy] };
    case 'quadrant': {
      const center: XY = [g.center[0] + dx, g.center[1] + dy];
      if (!g.offset) return { ...g, center };
      const d = g.offset.axis === 'x' ? dx : dy;
      return { ...g, center, offset: { ...g.offset, lo: g.offset.lo + d, hi: g.offset.hi + d } };
    }
    case 'spider':
      return {
        ...g,
        center: [g.center[0] + dx, g.center[1] + dy],
        arms: g.arms.map(([x, y]) => [x + dx, y + dy]) as typeof g.arms,
      };
    case 'split':
      return { ...g, at: g.at + dx };
    case 'curly': {
      // Shifted as drawn; the app rebuilds the legs for the new center with curlyAt (curlyEdit.ts).
      const shift = ([x, y]: readonly [number, number]): XY => [x + dx, y + dy];
      return { ...g, center: shift(g.center), up: g.up.map(shift), right: g.right.map(shift) };
    }
  }
}

/** A point clamped to the plotted x and y ranges (either may be reversed). */
export function clampToRange(p: readonly [number, number], xr: readonly number[], yr: readonly number[]): XY {
  return [
    Math.min(Math.max(p[0], Math.min(xr[0]!, xr[1]!)), Math.max(xr[0]!, xr[1]!)),
    Math.min(Math.max(p[1], Math.min(yr[0]!, yr[1]!)), Math.max(yr[0]!, yr[1]!)),
  ];
}

/** Spider arms at the midpoints of the plot's top, right, bottom and left edges. */
export function edgeArms(xr: readonly number[], yr: readonly number[]): [XY, XY, XY, XY] {
  const mx = (xr[0]! + xr[1]!) / 2;
  const my = (yr[0]! + yr[1]!) / 2;
  return [
    [mx, yr[1]!],
    [xr[1]!, my],
    [mx, yr[0]!],
    [xr[0]!, my],
  ];
}

/**
 * `base` with one handle dragged to `p` (gate units). Handles: rect `n`/`s`/`e`/`w` and corners (y ignored
 * on a histogram), polygon `v<i>`, ellipse axes `a` and `b`, quadrant and spider center `c`, quadrant
 * legs `up`/`right`/`down`/`left` (see dragLeg), spider `arm<i>`, split `c` (curly quadrants: dragCurly). `clamp` keeps spider points in the plot. Returns null for a spider arm that
 * would make the gate invalid.
 */
export function applyHandle(
  base: Geometry,
  handle: string,
  p: XY,
  is1d: boolean,
  clamp: (p: readonly [number, number]) => XY,
): Geometry | null {
  switch (base.kind) {
    case 'rect':
      return dragRectSide(base, handle, p, is1d);
    case 'polygon': {
      const i = Number(handle.slice(1));
      const v = base.vertices.map((q, k) => (k === i ? p : q)) as XY[];
      return { ...base, vertices: v };
    }
    case 'ellipse':
      return dragEllipseAxis(base, handle, p);
    case 'quadrant':
      if (handle === 'c') return translate(base, p[0] - base.center[0], p[1] - base.center[1]);
      return dragLeg(base, handle, p);
    case 'spider': {
      // arms stay where they are (inside the plot) while the center moves
      if (handle === 'c') return { ...base, center: clamp(p) };
      const i = Number(handle.slice(3));
      const arms = base.arms.map((q, k) => (k === i ? clamp(p) : q)) as typeof base.arms;
      return validateSpider(base.center, arms) === null ? { ...base, arms } : null;
    }
    case 'split':
      return { ...base, at: p[0] };
    case 'curly':
      // Its legs depend on the axis scales: dragCurly (curlyEdit.ts) handles it.
      return null;
  }
}

type RectGeometry = Extract<Geometry, { kind: 'rect' }>;
type QuadrantGeometry = Extract<Geometry, { kind: 'quadrant' }>;

/**
 * Quadrant `g` with the legs of its divider on `axis` at `lo` (below or left of the center) and `hi`
 * (above or right of it), and its center between them. Equal legs make a plain quadrant again.
 */
export function withLegs(g: QuadrantGeometry, axis: 'x' | 'y', lo: number, hi: number): QuadrantGeometry {
  const center: XY = axis === 'x' ? [(lo + hi) / 2, g.center[1]] : [g.center[0], (lo + hi) / 2];
  if (lo === hi) return { kind: 'quadrant', center };
  return { kind: 'quadrant', center, offset: { axis, lo, hi } };
}

/** An offset quadrant made plain, with its divider at the legs' midpoint (its center). */
export function straighten(g: QuadrantGeometry): QuadrantGeometry {
  return { kind: 'quadrant', center: g.center };
}

/**
 * Quadrant leg `handle` dragged to `p`: `up` and `down` move one leg of the vertical divider sideways,
 * `left` and `right` one leg of the horizontal divider up or down (FlowJo's offset quadrant). Only one
 * divider can be offset: when the other one already is, the leg moves its whole divider.
 */
function dragLeg(base: QuadrantGeometry, handle: string, p: XY): QuadrantGeometry {
  const axis = handle === 'up' || handle === 'down' ? 'x' : 'y';
  const v = axis === 'x' ? p[0] : p[1];
  if (base.offset && base.offset.axis !== axis)
    return { ...base, center: axis === 'x' ? [v, base.center[1]] : [base.center[0], v] };
  const d = quadrantDividers(base.center, base.offset);
  if (axis === 'x')
    return withLegs(base, 'x', handle === 'down' ? v : d.xBelow, handle === 'up' ? v : d.xAbove);
  return withLegs(base, 'y', handle === 'left' ? v : d.yLeft, handle === 'right' ? v : d.yRight);
}
type EllipseGeometry = Extract<Geometry, { kind: 'ellipse' }>;

/** Rectangle sides named in `handle` moved to `p`, swapped when dragged past each other. */
function dragRectSide(base: RectGeometry, handle: string, p: XY, is1d: boolean): RectGeometry {
  const min = [...base.min];
  const max = [...base.max];
  if (handle.includes('w')) min[0] = p[0];
  if (handle.includes('e')) max[0] = p[0];
  if (!is1d) {
    if (handle.includes('s')) min[1] = p[1];
    if (handle.includes('n')) max[1] = p[1];
  }
  for (let i = 0; i < min.length; i++) {
    const a = min[i];
    const b = max[i];
    if (a !== null && a !== undefined && b !== null && b !== undefined && a > b) {
      min[i] = b;
      max[i] = a;
    }
  }
  return { ...base, min, max };
}

/** Ellipse handle `a` turns and stretches the major axis to `p`; `b` sets the minor semi-axis. */
function dragEllipseAxis(base: EllipseGeometry, handle: string, p: XY): Geometry {
  const ax = ellipseAxes(base.mean, base.cov, base.d2);
  const dx = p[0] - ax.cx;
  const dy = p[1] - ax.cy;
  if (handle === 'a') {
    const a = Math.max(1e-4, Math.hypot(dx, dy));
    return { kind: 'ellipse', ...ellipseFromAxes(ax.cx, ax.cy, a, ax.b, Math.atan2(dy, dx)) };
  }
  if (handle === 'b') {
    const b = Math.max(1e-4, Math.abs(-dx * Math.sin(ax.theta) + dy * Math.cos(ax.theta)));
    return { kind: 'ellipse', ...ellipseFromAxes(ax.cx, ax.cy, ax.a, b, ax.theta) };
  }
  return base;
}

/** A new gate's parent and dimensions: the plot's population and axes. */
export function newGateBase(plot: PlotSpec, is1d: boolean): Omit<Gate, 'id' | 'geometry'> {
  return {
    parentPop: plot.population,
    dims: is1d
      ? [{ channel: plot.x.channel, comp: plot.x.comp, transform: plot.x.transform }]
      : [
          { channel: plot.x.channel, comp: plot.x.comp, transform: plot.x.transform },
          { channel: plot.y!.channel, comp: plot.y!.comp, transform: plot.y!.transform },
        ],
  };
}

/** A rectangle, range or ellipse gate dragged from `start` to `cur`. */
export function shapeFromDrag(tool: 'rect' | 'range' | 'ellipse', start: XY, cur: XY): Geometry {
  const [x0, y0] = start;
  const [x1, y1] = cur;
  if (tool === 'range') return { kind: 'rect', min: [Math.min(x0, x1)], max: [Math.max(x0, x1)] };
  if (tool === 'rect')
    return {
      kind: 'rect',
      min: [Math.min(x0, x1), Math.min(y0, y1)],
      max: [Math.max(x0, x1), Math.max(y0, y1)],
    };
  const e = ellipseFromAxes(
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    Math.abs(x1 - x0) / 2 || 1e-3,
    Math.abs(y1 - y0) / 2 || 1e-3,
    0,
  );
  return { kind: 'ellipse', ...e };
}
