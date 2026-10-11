import { ellipseAxes } from '@flowmeris/gating';
import type { AxisSpec, Gate, Geometry, Transform, Workspace } from '@flowmeris/model';
import { type Scale, makeScale } from '@flowmeris/transforms';

const scaleCache = new Map<string, Scale>();

export function scaleFor(ws: Workspace, transformId: string): Scale {
  const def = ws.transforms[transformId];
  if (!def) throw new Error(`Unknown transform ${transformId}`);
  return scaleOf(def, transformId);
}

export function scaleOf(def: Transform, key = JSON.stringify(def)): Scale {
  let s = scaleCache.get(key);
  if (!s) {
    s = makeScale(def);
    scaleCache.set(key, s);
  }
  return s;
}

/** Map a gate-space coordinate on one dimension into an axis' display units. */
export type DimMap = { identity: boolean; f: (v: number) => number; inv: (v: number) => number };

export function dimMap(ws: Workspace, gateDim: Gate['dims'][number], axis: AxisSpec): DimMap {
  if (gateDim.transform === axis.transform && gateDim.comp === axis.comp)
    return { identity: true, f: (v) => v, inv: (v) => v };
  const ax = scaleFor(ws, axis.transform);
  const g = gateDim.transform ? scaleFor(ws, gateDim.transform) : null;
  return {
    identity: false,
    f: (v) => ax.apply(g ? g.inverse(v) : v),
    inv: (v) => (g ? g.apply(ax.inverse(v)) : ax.inverse(v)),
  };
}

/** Gate shown on a plot when its parent is the plot population and its channels are the plot axes. */
export function gateMatchesAxes(gate: Gate, x: AxisSpec, y: AxisSpec | undefined): boolean {
  if (gate.dims.length === 1) return !y && gate.dims[0]!.channel === x.channel;
  if (!y) return false;
  return gate.dims[0]!.channel === x.channel && gate.dims[1]!.channel === y.channel;
}

export interface Pt {
  x: number;
  y: number;
}

function subdivide(a: [number, number], b: [number, number], k: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < k; i++) {
    const t = i / k;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Outline of a closed 2D gate shape in gate space (densified when the mapping is non-linear). */
export function outlineGateSpace(
  geom: Geometry,
  dense: boolean,
  bounds: [[number, number], [number, number]],
): [number, number][] {
  const k = dense ? 48 : 1;
  const closed = (pts: [number, number][]) =>
    pts.flatMap((p, i) => subdivide(p, pts[(i + 1) % pts.length]!, k));
  switch (geom.kind) {
    case 'rect': {
      const x0 = geom.min[0] ?? bounds[0][0];
      const x1 = geom.max[0] ?? bounds[0][1];
      const y0 = geom.min[1] ?? bounds[1][0];
      const y1 = geom.max[1] ?? bounds[1][1];
      return closed([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ]);
    }
    case 'polygon':
      return closed(geom.vertices.map((v) => [v[0], v[1]]));
    case 'ellipse': {
      const e = ellipseAxes(geom.mean, geom.cov, geom.d2);
      const pts: [number, number][] = [];
      const n = 180;
      for (let i = 0; i < n; i++) {
        const t = (2 * Math.PI * i) / n;
        const ca = Math.cos(e.theta);
        const sa = Math.sin(e.theta);
        const px = e.a * Math.cos(t);
        const py = e.b * Math.sin(t);
        pts.push([e.cx + px * ca - py * sa, e.cy + px * sa + py * ca]);
      }
      return pts;
    }
    default:
      return [];
  }
}

/** Ray from a center through a point, extended to (far beyond) the display bounds, in gate space. */
export function rayEnd(c: [number, number], through: [number, number], span: number): [number, number] {
  const dx = through[0] - c[0];
  const dy = through[1] - c[1];
  const len = Math.hypot(dx, dy) || 1;
  return [c[0] + (dx / len) * span, c[1] + (dy / len) * span];
}

export function pointInPolygonPx(pts: Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
