import { quadrantDividers } from '@flowmeris/gating';
import type { Geometry, Population, Region } from '@flowmeris/model';
import { handleVertex } from '../../lib/curlyEdit.ts';
import { type DimMap, type Pt, rayEnd } from '../../lib/geometry.ts';
import type { PlotFrame } from '../../lib/plotFrame.ts';

/** Where each quadrant / spider region's percentage label sits in a pw × ph plot. */
export const QUAD_CORNERS: Partial<
  Record<Region, (pw: number, ph: number) => [number, number, 'start' | 'end']>
> = {
  Q1: () => [6, 14, 'start'],
  Q2: (pw) => [pw - 6, 14, 'end'],
  Q3: (pw, ph) => [pw - 6, ph - 8, 'end'],
  Q4: (_pw, ph) => [6, ph - 8, 'start'],
};

export interface Handle {
  id: string;
  x: number;
  y: number;
  /** `mid`: a polygon edge's midpoint; `leg-x`, `leg-y`: a quadrant leg dragged along x or y. */
  shape?: 'mid' | 'leg-x' | 'leg-y';
}

export interface Label {
  popId: string;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
  focus?: boolean;
}

/** One gate's outline, its edit handles and its populations' labels, in plot pixels. */
export interface Drawn {
  body: JSX.Element;
  handles: Handle[];
  labels: Label[];
}

/** What drawing one gate needs besides its geometry. */
export interface DrawArgs {
  f: PlotFrame;
  m: DimMap[];
  cls: string;
  color: string;
  pops: Population[];
  /** A population's percentage of its parent, as label text. */
  pct: (popId: string, region: Region) => string;
  focusPopId: string | undefined;
}

/**
 * A quadrant or spider gate: rays from its center (from each leg's own foot on an offset quadrant),
 * region percentages in the plot corners.
 */
export function drawCross(geom: Extract<Geometry, { kind: 'quadrant' | 'spider' }>, d: DrawArgs): Drawn {
  const { f, m, cls, color } = d;
  const identity = m.every((q) => q.identity);
  const px = (p: readonly [number, number]) => ({ x: f.X(m[0]!.f(p[0])), y: f.Y(m[1]!.f(p[1])) });
  const { x: cx, y: cy } = px(geom.center);
  const legs = crossLegs(geom);
  const span = 4 * Math.max(f.xr[1] - f.xr[0], f.yr[1] - f.yr[0], 1) * (identity ? 1 : 1e3);
  // Rays are straight in gate space; on another axis scale they are sampled and mapped.
  const k = identity ? 1 : 200;
  const rays = legs.map(([from, through]) => {
    const end = rayEnd(from, through, span);
    const pts: Pt[] = [];
    for (let i = 0; i <= k; i++) {
      const t = i / k;
      pts.push(px([from[0] + (end[0] - from[0]) * t, from[1] + (end[1] - from[1]) * t]));
    }
    return pts;
  });
  const handles: Handle[] = [{ id: 'c', x: cx, y: cy }];
  const feet = legs.map(([from]) => px(from));
  if (geom.kind === 'spider') geom.arms.forEach((a, i) => handles.push({ id: `arm${i}`, ...px(a) }));
  else handles.push(...legHandles(feet, f));
  return { body: legLines(rays, cls, color), handles, labels: cornerLabels(d) };
}

/** Region percentages in the plot corners (quadrant, spider and curly quadrant gates). */
function cornerLabels(d: DrawArgs): Label[] {
  const labels: Label[] = [];
  for (const p of d.pops) {
    const c = QUAD_CORNERS[p.region]?.(d.f.pw, d.f.ph);
    if (c)
      labels.push({
        popId: p.id,
        text: `${d.pct(p.id, p.region)}%`,
        x: c[0],
        y: c[1],
        anchor: c[2],
        focus: p.id === d.focusPopId,
      });
  }
  return labels;
}

function legLines(legs: Pt[][], cls: string, color: string): JSX.Element {
  return (
    <g>
      {legs.map((r, i) => (
        <polyline
          key={i}
          points={r.map((p) => `${p.x},${p.y}`).join(' ')}
          className={cls}
          style={{ stroke: color }}
        />
      ))}
    </g>
  );
}

type CurlyGeometry = Extract<Geometry, { kind: 'curly' }>;

/**
 * A curly quadrant's four legs in gate space, [up, right, down, left]: the curved legs as stored, then
 * straight on for `span` past their last vertex (as membership treats them), and the straight legs.
 * Every straight stretch is cut into `k` pieces so it can be mapped onto another axis scale.
 */
export function curlyLegs(g: CurlyGeometry, span: number, k = 1): [number, number][][] {
  const [cx, cy] = g.center;
  const line = (a: readonly [number, number], b: readonly [number, number]) => {
    const pts: [number, number][] = [];
    for (let i = 1; i <= k; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k]);
    return pts;
  };
  const curved = (leg: readonly (readonly [number, number])[], dx: number, dy: number) => {
    const last = leg.at(-1)!;
    return [...leg.map(([x, y]): [number, number] => [x, y]), ...line(last, [last[0] + dx, last[1] + dy])];
  };
  return [
    curved(g.up, 0, span),
    curved(g.right, span, 0),
    [[cx, cy], ...line([cx, cy], [cx, cy - span])],
    [[cx, cy], ...line([cx, cy], [cx - span, cy])],
  ];
}

/**
 * A curly quadrant: straight lower and left legs, the upper and right legs curved, a round handle
 * halfway along each curved leg to set its curliness, region percentages in the plot corners.
 */
export function drawCurly(geom: CurlyGeometry, d: DrawArgs): Drawn {
  const { f, m, cls, color } = d;
  const identity = m.every((q) => q.identity);
  const px = (p: readonly [number, number]) => ({ x: f.X(m[0]!.f(p[0])), y: f.Y(m[1]!.f(p[1])) });
  const span = 4 * Math.max(f.xr[1] - f.xr[0], f.yr[1] - f.yr[0], 1) * (identity ? 1 : 1e3);
  const legs = curlyLegs(geom, span, identity ? 1 : 200).map((l) => l.map(px));
  const up = geom.up[handleVertex(geom.up)]!;
  const right = geom.right[handleVertex(geom.right)]!;
  const handles: Handle[] = [
    { id: 'c', ...px(geom.center) },
    { id: 'up', ...px(up), shape: 'leg-x' },
    { id: 'right', ...px(right), shape: 'leg-y' },
  ];
  return { body: legLines(legs, cls, color), handles, labels: cornerLabels(d) };
}

type Leg = [from: [number, number], through: [number, number]];

/** A cross gate's four rays in gate space, [up, right, down, left], each from its start through a point. */
function crossLegs(geom: Extract<Geometry, { kind: 'quadrant' | 'spider' }>): Leg[] {
  const c: [number, number] = [geom.center[0], geom.center[1]];
  if (geom.kind === 'spider') return geom.arms.map((a): Leg => [c, [a[0], a[1]]]);
  const q = quadrantDividers(geom.center, geom.offset);
  const leg = (x: number, y: number, dx: number, dy: number): Leg => [
    [x, y],
    [x + dx, y + dy],
  ];
  return [
    leg(q.xAbove, c[1], 0, 1),
    leg(c[0], q.yRight, 1, 0),
    leg(q.xBelow, c[1], 0, -1),
    leg(c[0], q.yLeft, -1, 0),
  ];
}

const LEG_IDS = ['up', 'right', 'down', 'left'] as const;

/**
 * A quadrant's leg handles, halfway from each leg's start (in pixels) to the plot edge it runs to. The
 * up and down legs are dragged sideways, the left and right legs up or down.
 */
function legHandles(feet: Pt[], f: PlotFrame): Handle[] {
  const [up, right, down, left] = feet as [Pt, Pt, Pt, Pt];
  const at = [
    { x: up.x, y: up.y / 2 },
    { x: (right.x + f.pw) / 2, y: right.y },
    { x: down.x, y: (down.y + f.ph) / 2 },
    { x: left.x / 2, y: left.y },
  ];
  return at.map((p, i) => ({ id: LEG_IDS[i]!, ...p, shape: i % 2 === 0 ? 'leg-x' : 'leg-y' }));
}
