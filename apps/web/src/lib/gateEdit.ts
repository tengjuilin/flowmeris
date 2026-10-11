import { ellipseAxes, ellipseFromAxes, validateSpider } from '@flowmeris/gating';
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
    case 'quadrant':
      return { ...g, center: [g.center[0] + dx, g.center[1] + dy] };
    case 'spider':
      return {
        ...g,
        center: [g.center[0] + dx, g.center[1] + dy],
        arms: g.arms.map(([x, y]) => [x + dx, y + dy]) as typeof g.arms,
      };
    case 'split':
      return { ...g, at: g.at + dx };
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
 * on a histogram), polygon `v<i>`, ellipse axes `a` and `b`, quadrant and spider center `c`, spider
 * `arm<i>`, split `c`. `clamp` keeps spider points in the plot. Returns null for a spider arm that
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
      return { ...base, center: p };
    case 'spider': {
      // arms stay where they are (inside the plot) while the center moves
      if (handle === 'c') return { ...base, center: clamp(p) };
      const i = Number(handle.slice(3));
      const arms = base.arms.map((q, k) => (k === i ? clamp(p) : q)) as typeof base.arms;
      return validateSpider(base.center, arms) === null ? { ...base, arms } : null;
    }
    case 'split':
      return { ...base, at: p[0] };
  }
}

type RectGeometry = Extract<Geometry, { kind: 'rect' }>;
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
