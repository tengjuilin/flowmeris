import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { inPolygon, preparePolygon } from './geometry.ts';
import { evaluateGate } from './membership.ts';
import { inPolygonBands, polygonBands } from './polygonBands.ts';

// Coordinates on a coarse grid make ties (shared y values, collinear and duplicate vertices) common.
const grid = fc.integer({ min: -6, max: 6 }).map((k) => k / 2);
const fine = fc.double({ min: -4, max: 4, noNaN: true });
const coord = fc.oneof(grid, grid, fine, fc.constantFrom(-0, Number.NaN, 1e-300));
const vertex = fc.tuple(coord, coord);
const polygon = fc.array(vertex, { minLength: 1, maxLength: 24 });

describe('polygonBands (M-GATE-POLY through a band index)', () => {
  it('gives inPolygon on any polygon, at vertex coordinates and between them', () => {
    fc.assert(
      fc.property(polygon, fc.array(vertex, { maxLength: 40 }), (verts, pts) => {
        const poly = preparePolygon(verts);
        const bands = polygonBands(poly);
        expect(bands).not.toBeNull();
        // Every vertex coordinate combination, on top of the drawn points.
        const probes: [number, number][] = [...pts];
        for (const [vx] of verts) for (const [, vy] of verts) probes.push([vx, vy]);
        for (const [px, py] of probes) expect(inPolygonBands(bands!, px, py)).toBe(inPolygon(poly, px, py));
      }),
      { numRuns: 500 },
    );
  });

  it('gives the same gate membership as the unbanded test', () => {
    fc.assert(
      fc.property(polygon, fc.array(vertex, { minLength: 1, maxLength: 100 }), (verts, pts) => {
        const x = Float64Array.from(pts, (p) => p[0]);
        const y = Float64Array.from(pts, (p) => p[1]);
        const got = evaluateGate({ kind: 'polygon', vertices: verts }, [x, y], pts.length, null).regions.in!;
        const poly = preparePolygon(verts);
        // The kernel's own bounding-box prefilter (which a NaN box rejects everything with), then inPolygon.
        const inBox = (xv: number, yv: number) =>
          xv >= poly.minX && xv <= poly.maxX && yv >= poly.minY && yv <= poly.maxY;
        for (let i = 0; i < pts.length; i++)
          expect(((got[i >> 5]! >>> (i & 31)) & 1) === 1).toBe(
            inBox(x[i]!, y[i]!) && inPolygon(poly, x[i]!, y[i]!),
          );
      }),
      { numRuns: 300 },
    );
  });
});
