import { spiderRegion } from '@flowmeris/gating';
import { type Gate, type GatingTemplate, type Geometry, populationsOfGate } from '@flowmeris/model';
import { type DimMap, type Pt, outlineGateSpace, pointInPolygonPx } from './geometry.ts';

/** Stands in for an open rectangle side when it is drawn. */
export const SPAN = 1e6;

/**
 * The plot area: `xr` and `yr` are the axis ranges in display units, drawn in pw × ph pixels (y up).
 * `X` and `Y` map display units to pixels, `toData` maps back.
 */
export interface PlotFrame {
  xr: readonly [number, number];
  yr: readonly [number, number];
  pw: number;
  ph: number;
  X: (v: number) => number;
  Y: (v: number) => number;
  toData: (px: number, py: number) => [number, number];
}

export function plotFrame(
  xr: readonly [number, number],
  yr: readonly [number, number],
  pw: number,
  ph: number,
): PlotFrame {
  return {
    xr,
    yr,
    pw,
    ph,
    X: (v) => ((v - xr[0]) / (xr[1] - xr[0])) * pw,
    Y: (v) => ph - ((v - yr[0]) / (yr[1] - yr[0])) * ph,
    toData: (px, py) => [xr[0] + (px / pw) * (xr[1] - xr[0]), yr[0] + ((ph - py) / ph) * (yr[1] - yr[0])],
  };
}

/** A gate as a plot draws it: its geometry now (a drag may be under way) and its axis mappings. */
export interface ShownGate {
  gate: Gate;
  geom: Geometry;
  maps: DimMap[];
}

/** Outline of a closed gate shape (rect, polygon, ellipse) in pixels. */
export function shapePx(f: PlotFrame, maps: DimMap[], geom: Geometry): Pt[] {
  const [mx, my] = maps;
  const dense = !maps.every((d) => d.identity);
  const bounds: [[number, number], [number, number]] = [
    [mx!.inv(f.xr[0] - 10), mx!.inv(f.xr[1] + 10)],
    my ? [my.inv(f.yr[0] - 10), my.inv(f.yr[1] + 10)] : [0, 1],
  ];
  return outlineGateSpace(geom, dense, bounds).map(([a, b]) => ({
    x: f.X(mx!.f(a)),
    y: f.Y(my ? my.f(b) : 0),
  }));
}

/**
 * The topmost gate under pixel (px, py): near a quadrant or spider center, near a split divider,
 * between a histogram range's edges, or inside a closed shape.
 */
export function hitGate(f: PlotFrame, shown: ShownGate[], px: number, py: number, is1d: boolean) {
  for (const { gate, geom, maps } of [...shown].reverse()) {
    if (geom.kind === 'quadrant' || geom.kind === 'spider') {
      const cx = f.X(maps[0]!.f(geom.center[0]));
      const cy = f.Y(maps[1]!.f(geom.center[1]));
      if (Math.hypot(px - cx, py - cy) < 12) return gate;
      continue;
    }
    if (geom.kind === 'split') {
      if (Math.abs(px - f.X(maps[0]!.f(geom.at))) < 6) return gate;
      continue;
    }
    if (is1d && geom.kind === 'rect') {
      const m = maps[0]!;
      const a = f.X(m.f(geom.min[0] ?? -SPAN));
      const b = f.X(m.f(geom.max[0] ?? SPAN));
      if (px >= a && px <= b) return gate;
      continue;
    }
    if (pointInPolygonPx(shapePx(f, maps, geom), { x: px, y: py })) return gate;
  }
  return undefined;
}

/**
 * The population under pixel (px, py), for drilling down. The topmost split, quadrant or spider gate
 * answers with the region the point is in, wherever it is; other gates answer when the point is inside.
 */
export function popAt(
  f: PlotFrame,
  template: GatingTemplate,
  shown: ShownGate[],
  px: number,
  py: number,
  is1d: boolean,
): string | undefined {
  for (const { gate, geom, maps } of [...shown].reverse()) {
    const pops = populationsOfGate(template, gate.id);
    if (geom.kind === 'split') {
      // Either side of the divider is one of the two populations.
      const v = maps[0]!.inv(f.toData(px, py)[0]);
      return pops.find((p) => p.region === (v >= geom.at ? 'hi' : 'lo'))?.id;
    }
    if (geom.kind === 'quadrant' || geom.kind === 'spider') {
      const [dx, dy] = f.toData(px, py);
      const gx = maps[0]!.inv(dx);
      const gy = maps[1]!.inv(dy);
      let r: number;
      if (geom.kind === 'spider') r = spiderRegion(geom.center[0], geom.center[1], geom.arms, gx, gy);
      else r = gy >= geom.center[1] ? (gx >= geom.center[0] ? 2 : 1) : gx >= geom.center[0] ? 3 : 4;
      return pops.find((p) => p.region === `Q${r}`)?.id;
    }
    if (hitGate(f, shown, px, py, is1d)?.id === gate.id) return pops[0]?.id;
  }
  return undefined;
}
