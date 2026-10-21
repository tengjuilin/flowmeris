import type { Geometry } from '@flowmeris/model';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CURLY_VERTICES,
  type CurlyAxis,
  curlinessThrough,
  curlyLeg,
  curlyRegion,
  evaluateGate,
  getBit,
  popcount,
  quadrantDividers,
  quadrantRegion,
  validateCurly,
} from './index.ts';

const linear: CurlyAxis = { toLinear: (v) => v, fromLinear: (v) => v };
/** A log-like axis: gate units 0–1 over linear 1–10⁵. */
const log5: CurlyAxis = { toLinear: (v) => 10 ** (5 * v), fromLinear: (v) => Math.log10(v) / 5 };

function curly(
  center: [number, number],
  a: [number, number],
  axes: readonly [CurlyAxis, CurlyAxis],
  top: [number, number],
): Extract<Geometry, { kind: 'curly' }> {
  return {
    kind: 'curly',
    center,
    a,
    up: curlyLeg(center, a[0], 1, axes, top[1]),
    right: curlyLeg(center, a[1], 0, axes, top[0]),
  };
}

describe('M-GATE-CURLY', () => {
  it('legs follow x = cx + a·(√y − √cy) in linear units', () => {
    const g = curly([100, 400], [2, 3], [linear, linear], [1000, 1000]);
    expect(g.up).toHaveLength(CURLY_VERTICES);
    expect(g.up[0]).toEqual([100, 400]);
    for (const [x, y] of g.up) expect(x).toBeCloseTo(100 + 2 * (Math.sqrt(y) - 20), 9);
    for (const [x, y] of g.right) expect(y).toBeCloseTo(400 + 3 * (Math.sqrt(x) - 10), 9);
    expect(g.up.at(-1)![1]).toBe(1000);
    expect(validateCurly(g.center, g.up, g.right)).toBeNull();
  });

  it('curlinessThrough inverts curlyLeg on a log axis', () => {
    const c: [number, number] = [0.4, 0.5];
    const g = curly(c, [4, 7], [log5, log5], [1, 1]);
    const p = g.up[30]!;
    expect(curlinessThrough(c, 1, [log5, log5], p)).toBeCloseTo(4, 9);
    expect(curlinessThrough(c, 0, [log5, log5], g.right[12]!)).toBeCloseTo(7, 9);
    expect(curlinessThrough(c, 1, [log5, log5], [0.3, 0.9])).toBe(0);
  });

  it('with no curl is the plain quadrant, ties included', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -60, max: 60 }),
        fc.integer({ min: -60, max: 60 }),
        (cx, cy, x, y) => {
          const g = curly([cx, cy], [0, 0], [linear, linear], [100, 100]);
          const plain = quadrantRegion(quadrantDividers([cx, cy]), x, y);
          expect(curlyRegion(g.center, g.up, g.right, x, y)).toBe(plain);
        },
      ),
    );
  });

  it('assigns points beside each curved leg', () => {
    const g = curly([100, 400], [2, 3], [linear, linear], [1000, 1000]);
    const r = (x: number, y: number) => curlyRegion(g.center, g.up, g.right, x, y);
    // upper leg at y = 900: x = 100 + 2(30 − 20) = 120
    expect(r(119, 900)).toBe(1);
    expect(r(121, 900)).toBe(2);
    // right leg at x = 900: y = 400 + 3(30 − 10) = 460
    expect(r(900, 459)).toBe(3);
    expect(r(900, 461)).toBe(2);
    // beyond the last vertices the legs go straight on
    expect(r(124, 5000)).toBe(2); // last vertex x = 100 + 2(√1000 − 20) ≈ 123.2
    expect(r(123, 5000)).toBe(1);
    expect(r(5000, 400 + 3 * (Math.sqrt(1000) - 10) - 1)).toBe(3);
    expect(r(99, 300)).toBe(4);
    expect(r(100, 300)).toBe(3);
    expect(r(Number.NaN, 1)).toBe(0);
  });

  it('puts every non-NaN event in exactly one region', () => {
    const g = curly([0.3, 0.35], [6, 9], [log5, log5], [1, 1]);
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.double({ min: -0.2, max: 1.4 }), fc.double({ min: -0.2, max: 1.4 })), {
          maxLength: 200,
        }),
        (pts) => {
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const { regions } = evaluateGate(g, [xs, ys], pts.length, null);
          let total = 0;
          for (const k of ['Q1', 'Q2', 'Q3', 'Q4'] as const) total += popcount(regions[k]!);
          expect(total).toBe(pts.filter((p) => !Number.isNaN(p[0]) && !Number.isNaN(p[1])).length);
          pts.forEach(([x, y], i) => {
            const k = curlyRegion(g.center, g.up, g.right, x, y);
            if (k) expect(getBit(regions[`Q${k}` as 'Q1']!, i)).toBe(true);
          });
        },
      ),
    );
  });

  it('rejects crossing or malformed legs', () => {
    const g = curly([0.3, 0.35], [6, 9], [log5, log5], [1, 1]);
    expect(validateCurly(g.center, g.up, g.right)).toBeNull();
    const crossed = curly([100, 100], [200, 200], [linear, linear], [1000, 1000]);
    expect(validateCurly(crossed.center, crossed.up, crossed.right)).toMatch(/cross/);
    expect(
      validateCurly(
        [0, 0],
        [
          [1, 0],
          [1, 1],
        ],
        g.right,
      ),
    ).toMatch(/start at the center/);
  });
});
