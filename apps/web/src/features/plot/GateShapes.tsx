import { ellipseAxes } from '@flowmeris/gating';
import {
  type Gate,
  type Geometry,
  type Group,
  type PlotFigure,
  type Population,
  type Region,
  isOverridden,
  populationsOfGate,
} from '@flowmeris/model';
import { figureText } from '../../lib/figure.ts';
import { type DimMap, type Pt, rayEnd } from '../../lib/geometry.ts';
import { type PlotFrame, SPAN, shapePx } from '../../lib/plotFrame.ts';
import type { Drag } from './useGateEditing.ts';
import type { RegionCounts } from './useGatePreview.ts';

/** Where each quadrant / spider region's percentage label sits in a pw × ph plot. */
export const QUAD_CORNERS: Partial<
  Record<Region, (pw: number, ph: number) => [number, number, 'start' | 'end']>
> = {
  Q1: () => [6, 14, 'start'],
  Q2: (pw) => [pw - 6, 14, 'end'],
  Q3: (pw, ph) => [pw - 6, ph - 8, 'end'],
  Q4: (_pw, ph) => [6, ph - 8, 'start'],
};

interface Handle {
  id: string;
  x: number;
  y: number;
  shape?: 'mid';
}

interface Label {
  popId: string;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
  focus?: boolean;
}

/** One gate's outline, its edit handles and its populations' labels, in plot pixels. */
interface Drawn {
  body: JSX.Element;
  handles: Handle[];
  labels: Label[];
}

/** What drawing one gate needs besides its geometry. */
interface DrawArgs {
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
 * FlowJo's bisector: one vertical divider and a bar across the plot; the two populations are labeled
 * in the top corners, − on the left and + on the right.
 */
function drawSplit(geom: Extract<Geometry, { kind: 'split' }>, d: DrawArgs): Drawn {
  const { f, m, cls, color } = d;
  const a = f.X(m[0]!.f(geom.at));
  const barY = f.ph * 0.12;
  return {
    body: (
      <g>
        <line x1={a} x2={a} y1={0} y2={f.ph} className={cls} style={{ stroke: color }} />
        <line x1={0} x2={f.pw} y1={barY} y2={barY} className={cls} style={{ stroke: color }} />
      </g>
    ),
    handles: [{ id: 'c', x: a, y: barY }],
    labels: d.pops.map((p) => ({
      popId: p.id,
      text: `${p.name} ${d.pct(p.id, p.region)}%`,
      x: p.region === 'hi' ? f.pw - 6 : 6,
      y: barY - 6,
      anchor: p.region === 'hi' ? 'end' : 'start',
      focus: p.id === d.focusPopId,
    })),
  };
}

/** A histogram range: shaded between its edges, with a bar across near the top. */
function drawRange(geom: Extract<Geometry, { kind: 'rect' }>, d: DrawArgs): Drawn {
  const { f, m, cls, color } = d;
  const a = f.X(m[0]!.f(geom.min[0] ?? -SPAN));
  const b = f.X(m[0]!.f(geom.max[0] ?? SPAN));
  const ca = Math.max(0, a);
  const cb = Math.min(f.pw, b);
  const handles: Handle[] = [];
  if (geom.min[0] !== null) handles.push({ id: 'w', x: a, y: f.ph * 0.12 });
  if (geom.max[0] !== null) handles.push({ id: 'e', x: b, y: f.ph * 0.12 });
  const pop = d.pops[0];
  return {
    body: (
      <g>
        <rect
          x={ca}
          y={0}
          width={Math.max(0, cb - ca)}
          height={f.ph}
          className="gate-fill"
          style={{ fill: color }}
        />
        <line x1={a} x2={a} y1={0} y2={f.ph} className={cls} style={{ stroke: color }} />
        <line x1={b} x2={b} y1={0} y2={f.ph} className={cls} style={{ stroke: color }} />
        <line x1={ca} x2={cb} y1={f.ph * 0.12} y2={f.ph * 0.12} className={cls} style={{ stroke: color }} />
      </g>
    ),
    handles,
    labels: pop
      ? [
          {
            popId: pop.id,
            text: `${pop.name} ${d.pct(pop.id, 'in')}%`,
            x: Math.min(Math.max(ca + 4, 4), f.pw - 4),
            y: f.ph * 0.12 - 6,
            anchor: 'start',
          },
        ]
      : [],
  };
}

/** A quadrant or spider gate: rays from its center, region percentages in the plot corners. */
function drawCross(geom: Extract<Geometry, { kind: 'quadrant' | 'spider' }>, d: DrawArgs): Drawn {
  const { f, m, cls, color } = d;
  const identity = m.every((q) => q.identity);
  const cx = f.X(m[0]!.f(geom.center[0]));
  const cy = f.Y(m[1]!.f(geom.center[1]));
  const dirs: [number, number][] =
    geom.kind === 'quadrant'
      ? [
          [geom.center[0], geom.center[1] + 1],
          [geom.center[0] + 1, geom.center[1]],
          [geom.center[0], geom.center[1] - 1],
          [geom.center[0] - 1, geom.center[1]],
        ]
      : geom.arms.map((a) => [a[0], a[1]] as [number, number]);
  const span = 4 * Math.max(f.xr[1] - f.xr[0], f.yr[1] - f.yr[0], 1) * (identity ? 1 : 1e3);
  // Rays are straight in gate space; on another axis scale they are sampled and mapped.
  const k = identity ? 1 : 200;
  const rays = dirs.map((dir) => {
    const end = rayEnd(geom.center, dir, span);
    const pts: Pt[] = [];
    for (let i = 0; i <= k; i++) {
      const t = i / k;
      const gx = geom.center[0] + (end[0] - geom.center[0]) * t;
      const gy = geom.center[1] + (end[1] - geom.center[1]) * t;
      pts.push({ x: f.X(m[0]!.f(gx)), y: f.Y(m[1]!.f(gy)) });
    }
    return pts;
  });
  const handles: Handle[] = [{ id: 'c', x: cx, y: cy }];
  if (geom.kind === 'spider')
    geom.arms.forEach((a, i) =>
      handles.push({ id: `arm${i}`, x: f.X(m[0]!.f(a[0])), y: f.Y(m[1]!.f(a[1])) }),
    );
  const labels: Label[] = [];
  for (const p of d.pops) {
    const c = QUAD_CORNERS[p.region]?.(f.pw, f.ph);
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
  return {
    body: (
      <g>
        {rays.map((r, i) => (
          <polyline
            key={i}
            points={r.map((p) => `${p.x},${p.y}`).join(' ')}
            className={cls}
            style={{ stroke: color }}
          />
        ))}
      </g>
    ),
    handles,
    labels,
  };
}

/** Edit handles of a closed shape: rect sides and corners, polygon vertices and edge midpoints, ellipse axes. */
function closedHandles(geom: Geometry, f: PlotFrame, m: DimMap[]): Handle[] {
  const handles: Handle[] = [];
  if (geom.kind === 'rect') {
    const x0 = f.X(m[0]!.f(geom.min[0] ?? -SPAN));
    const x1 = f.X(m[0]!.f(geom.max[0] ?? SPAN));
    const y0 = f.Y(m[1]!.f(geom.min[1] ?? -SPAN));
    const y1 = f.Y(m[1]!.f(geom.max[1] ?? SPAN));
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    for (const [id, x, y] of [
      ['sw', x0, y0],
      ['se', x1, y0],
      ['nw', x0, y1],
      ['ne', x1, y1],
      ['w', x0, my],
      ['e', x1, my],
      ['s', mx, y0],
      ['n', mx, y1],
    ] as const)
      handles.push({ id, x, y });
  } else if (geom.kind === 'polygon') {
    geom.vertices.forEach((v, i) => {
      handles.push({ id: `v${i}`, x: f.X(m[0]!.f(v[0])), y: f.Y(m[1]!.f(v[1])) });
      const w = geom.vertices[(i + 1) % geom.vertices.length]!;
      handles.push({
        id: `mid${i}`,
        x: f.X(m[0]!.f((v[0] + w[0]) / 2)),
        y: f.Y(m[1]!.f((v[1] + w[1]) / 2)),
        shape: 'mid',
      });
    });
  } else if (geom.kind === 'ellipse') {
    const e = ellipseAxes(geom.mean, geom.cov, geom.d2);
    handles.push({ id: 'a', x: f.X(e.cx + e.a * Math.cos(e.theta)), y: f.Y(e.cy + e.a * Math.sin(e.theta)) });
    handles.push({ id: 'b', x: f.X(e.cx - e.b * Math.sin(e.theta)), y: f.Y(e.cy + e.b * Math.cos(e.theta)) });
  }
  return handles;
}

/** A rectangle, polygon or ellipse gate, labeled above its top-left corner. */
function drawClosed(geom: Geometry, d: DrawArgs): Drawn {
  const { f, m, cls, color } = d;
  const pts = shapePx(f, m, geom);
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const pop = d.pops[0];
  return {
    body: (
      <polygon
        points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
        className={`${cls} gate-closed`}
        style={{ stroke: color }}
      />
    ),
    handles: closedHandles(geom, f, m),
    labels: pop
      ? [
          {
            popId: pop.id,
            text: `${pop.name} ${d.pct(pop.id, 'in')}%`,
            x: Math.max(4, Math.min(f.pw - 60, minX)),
            y: Math.max(12, minY - 6),
            anchor: 'start',
          },
        ]
      : [],
  };
}

function drawGate(geom: Geometry, is1d: boolean, d: DrawArgs): Drawn {
  if (geom.kind === 'split') return drawSplit(geom, d);
  if (is1d && geom.kind === 'rect') return drawRange(geom, d);
  if (geom.kind === 'quadrant' || geom.kind === 'spider') return drawCross(geom, d);
  return drawClosed(geom, d);
}

function HandleMarks({ handles, gateId }: { handles: Handle[]; gateId: string }) {
  return (
    <>
      {handles.map((h) =>
        h.shape === 'mid' ? (
          <circle
            key={h.id}
            cx={h.x}
            cy={h.y}
            r={3.5}
            className="handle handle-mid"
            data-handle={h.id}
            data-gate={gateId}
          />
        ) : (
          <rect
            key={h.id}
            x={h.x - 4.5}
            y={h.y - 4.5}
            width={9}
            height={9}
            className="handle"
            data-handle={h.id}
            data-gate={gateId}
          />
        ),
      )}
    </>
  );
}

/** A population's label, moved by `offset` (fractions of the plot size) when the user has dragged it. */
function GateLabel({
  l,
  f,
  fig,
  compact,
  movable,
  offset: off,
}: {
  l: Label;
  f: PlotFrame;
  fig: PlotFigure;
  compact: boolean;
  movable: boolean;
  offset: readonly [number, number] | undefined;
}) {
  // A moved label stays inside the plot, however small the plot is drawn.
  const x = off ? Math.min(Math.max(l.x + off[0] * f.pw, 2), f.pw - 2) : l.x;
  const y = off ? Math.min(Math.max(l.y + off[1] * f.ph, 10), f.ph - 2) : l.y;
  return (
    <text
      x={x}
      y={y}
      textAnchor={l.anchor}
      data-label-pop={movable ? l.popId : undefined}
      className={`gate-label${l.focus ? ' focus' : ''}${movable ? ' movable' : ''}`}
      style={
        compact
          ? undefined
          : figureText(fig, fig.gateText, l.focus ? fig.gateFontSize * (13 / 11.5) : fig.gateFontSize)
      }
    >
      {movable && <title>Drag to move this label; double-click to put it back</title>}
      {l.text}
    </text>
  );
}

export interface GateShapesProps {
  group: Group;
  sampleId: string;
  frame: PlotFrame;
  is1d: boolean;
  fig: PlotFigure;
  compact: boolean;
  gates: Gate[];
  geomOf: (gate: Gate) => Geometry;
  maps: (gate: Gate) => DimMap[];
  interactive: boolean;
  selectedGateId: string | null;
  focusPopId: string | undefined;
  labelsMovable: boolean;
  drag: Drag | null;
  /** Counts of the gate being dragged, which replace its committed counts. */
  preview: (RegionCounts & { gateId: string }) | null;
  counts: Record<string, { count: number; parent: number }>;
}

/**
 * The plot's gates with their population labels (movable on full-size plots) and, on the selected
 * editable gate, its handles.
 */
export function GateShapes(props: GateShapesProps) {
  const { group, sampleId, frame: f, is1d, fig, compact, gates, geomOf, maps } = props;
  const { interactive, selectedGateId, focusPopId, labelsMovable, drag, preview, counts } = props;

  const fmtPct = (popId: string, region: Region, gateId: string) => {
    if (preview && preview.gateId === gateId) {
      const c = preview.regions[region] ?? 0;
      return preview.parent > 0 ? ((100 * c) / preview.parent).toFixed(2) : '–';
    }
    const c = counts[popId];
    if (!c || c.parent === 0) return '…';
    return ((100 * c.count) / c.parent).toFixed(2);
  };

  return (
    <>
      {gates.map((gate) => {
        const geom = geomOf(gate);
        const m = maps(gate);
        const editable = interactive && m.every((d) => d.identity);
        const selected = interactive && selectedGateId === gate.id;
        const overridden = isOverridden(group, gate.id, sampleId);
        const pops = populationsOfGate(group.template, gate.id);
        const color = pops[0]?.color ?? '#2a78d6';
        const focused = focusPopId !== undefined && pops.some((p) => p.id === focusPopId);
        const dimmed = focusPopId !== undefined && !focused;
        const cls = `gate${selected ? ' selected' : ''}${overridden ? ' overridden' : ''}${focused ? ' focus' : ''}`;
        const pct = (popId: string, region: Region) => fmtPct(popId, region, gate.id);
        const { body, handles, labels } = drawGate(geom, is1d, { f, m, cls, color, pops, pct, focusPopId });
        return (
          <g key={gate.id} data-gate-id={gate.id} className={dimmed ? 'gate-dim' : undefined}>
            <g className="gate-halo">{body}</g>
            {body}
            {labels.map((l) => (
              <GateLabel
                key={l.popId}
                l={l}
                f={f}
                fig={fig}
                compact={compact}
                movable={labelsMovable}
                offset={
                  drag?.kind === 'label' && drag.popId === l.popId
                    ? drag.cur
                    : group.template.populations[l.popId]?.labelOffset
                }
              />
            ))}
            {selected && editable && <HandleMarks handles={handles} gateId={gate.id} />}
          </g>
        );
      })}
    </>
  );
}
