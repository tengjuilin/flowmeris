import type { AxisSpec, Gate, Workspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { dimMap, gateMatchesAxes, outlineGateSpace, pointInPolygonPx, rayEnd } from './geometry.ts';

const axis = (channel: string, transform = 'lin'): AxisSpec => ({
  channel,
  comp: 'group',
  transform,
  range: [0, 1],
});
const gate = (...channels: string[]): Gate =>
  ({ dims: channels.map((channel) => ({ channel, comp: 'group', transform: 'lin' })) }) as unknown as Gate;

describe('which gates a plot shows', () => {
  it('a 1D gate on a histogram of its channel', () => {
    expect(gateMatchesAxes(gate('FL1'), axis('FL1'), undefined)).toBe(true);
    expect(gateMatchesAxes(gate('FL1'), axis('FL2'), undefined)).toBe(false);
    expect(gateMatchesAxes(gate('FL1'), axis('FL1'), axis('FL2'))).toBe(false);
  });

  it('a 2D gate on a plot with its channels in the same order', () => {
    expect(gateMatchesAxes(gate('FSC', 'SSC'), axis('FSC'), axis('SSC'))).toBe(true);
    expect(gateMatchesAxes(gate('FSC', 'SSC'), axis('SSC'), axis('FSC'))).toBe(false);
    expect(gateMatchesAxes(gate('FSC', 'SSC'), axis('FSC'), undefined)).toBe(false);
  });
});

describe('gate coordinates on an axis', () => {
  const ws = {
    transforms: {
      lin: { kind: 'flin', T: 1000, A: 0 },
      log: { kind: 'flog', T: 10000, M: 4 },
    },
  } as unknown as Workspace;

  it('is the identity when the gate and axis share the transform and compensation', () => {
    const m = dimMap(ws, { channel: 'A', comp: 'group', transform: 'lin' }, axis('A', 'lin'));
    expect(m.identity).toBe(true);
    expect(m.f(0.3)).toBe(0.3);
  });

  it('maps through raw units between transforms, and back', () => {
    const m = dimMap(ws, { channel: 'A', comp: 'group', transform: 'lin' }, axis('A', 'log'));
    expect(m.identity).toBe(false);
    // 0.1 on flin(T = 1000) is 100 raw; flog(T = 1e4, M = 4) of 100 is 1 + log10(100 / 1e4) / 4 = 0.5.
    expect(m.f(0.1)).toBeCloseTo(0.5, 12);
    expect(m.inv(0.5)).toBeCloseTo(0.1, 12);
    for (const v of [0.01, 0.2, 0.9]) expect(m.inv(m.f(v))).toBeCloseTo(v, 12);
  });

  it('treats a gate in raw units as untransformed', () => {
    const m = dimMap(ws, { channel: 'A', comp: 'group', transform: null }, axis('A', 'lin'));
    expect(m.f(250)).toBeCloseTo(0.25, 12);
    expect(m.inv(0.25)).toBeCloseTo(250, 9);
  });

  it('throws on an unknown transform', () => {
    expect(() => dimMap(ws, { channel: 'A', comp: 'group', transform: 'lin' }, axis('A', 'nope'))).toThrow(
      /Unknown transform nope/,
    );
  });
});

describe('gate outlines', () => {
  const bounds: [[number, number], [number, number]] = [
    [-1, 11],
    [-2, 12],
  ];

  it('a rectangle is its four corners, open sides running to the display bounds', () => {
    expect(outlineGateSpace({ kind: 'rect', min: [1, 2], max: [3, 4] }, false, bounds)).toEqual([
      [1, 2],
      [3, 2],
      [3, 4],
      [1, 4],
    ]);
    expect(outlineGateSpace({ kind: 'rect', min: [null, 2], max: [3, null] }, false, bounds)).toEqual([
      [-1, 2],
      [3, 2],
      [3, 12],
      [-1, 12],
    ]);
  });

  it('densifies each side for non-linear mappings, staying on the side', () => {
    const pts = outlineGateSpace({ kind: 'rect', min: [0, 0], max: [1, 1] }, true, bounds);
    expect(pts).toHaveLength(4 * 48);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[24]).toEqual([0.5, 0]);
    expect(pts.every(([x, y]) => x === 0 || x === 1 || y === 0 || y === 1)).toBe(true);
  });

  it('a polygon keeps its vertices in order', () => {
    const vertices: [number, number][] = [
      [0, 0],
      [2, 0],
      [1, 3],
    ];
    expect(outlineGateSpace({ kind: 'polygon', vertices }, false, bounds)).toEqual(vertices);
  });

  it('an ellipse outline lies on the Mahalanobis contour d² of the gate', () => {
    const mean: [number, number] = [5, 3];
    const cov: [[number, number], [number, number]] = [
      [4, 1.5],
      [1.5, 2],
    ];
    const d2 = 2.5;
    const pts = outlineGateSpace({ kind: 'ellipse', mean, cov, d2 }, false, bounds);
    expect(pts).toHaveLength(180);
    const det = cov[0][0] * cov[1][1] - cov[0][1] * cov[1][0];
    for (const [x, y] of pts) {
      const dx = x - mean[0];
      const dy = y - mean[1];
      const m = (cov[1][1] * dx * dx - 2 * cov[0][1] * dx * dy + cov[0][0] * dy * dy) / det;
      expect(m).toBeCloseTo(d2, 9);
    }
  });
});

describe('pointer geometry in pixels', () => {
  it('a ray from the centre through a point, extended to a length', () => {
    expect(rayEnd([1, 1], [4, 5], 10)).toEqual([7, 9]);
    // A point on the centre gives a ray of zero length rather than NaN.
    expect(rayEnd([1, 1], [1, 1], 10)).toEqual([1, 1]);
  });

  it('point in polygon, convex and concave', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygonPx(square, { x: 5, y: 5 })).toBe(true);
    expect(pointInPolygonPx(square, { x: 11, y: 5 })).toBe(false);
    expect(pointInPolygonPx(square, { x: -0.1, y: 5 })).toBe(false);
    // A "U": the notch between the arms is outside.
    const u = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygonPx(u, { x: 5, y: 3 })).toBe(false);
    expect(pointInPolygonPx(u, { x: 1, y: 3 })).toBe(true);
    expect(pointInPolygonPx(u, { x: 5, y: 9 })).toBe(true);
    expect(pointInPolygonPx([], { x: 0, y: 0 })).toBe(false);
  });
});
