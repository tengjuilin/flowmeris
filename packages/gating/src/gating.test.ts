import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  and,
  ellipseAxes,
  ellipseFromAxes,
  evaluateGate,
  fromBooleans,
  fullBitset,
  getBit,
  not,
  or,
  popcount,
  spiderFromQuadrant,
  spiderRegion,
  toIndices,
  validateSpider,
} from './index.ts';

const coord = fc.double({ min: -1e3, max: 1e3, noNaN: true });

describe('bitsets', () => {
  it('match a boolean-array reference for and/or/not/popcount', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { maxLength: 200 }),
        fc.array(fc.boolean(), { maxLength: 200 }),
        (a0, b0) => {
          const n = Math.min(a0.length, b0.length);
          const a = a0.slice(0, n);
          const b = b0.slice(0, n);
          const A = fromBooleans(a);
          const B = fromBooleans(b);
          const check = (bits: Uint32Array, ref: boolean[]) => {
            expect(popcount(bits)).toBe(ref.filter(Boolean).length);
            for (let i = 0; i < n; i++) expect(getBit(bits, i)).toBe(ref[i]);
            expect(Array.from(toIndices(bits))).toEqual(ref.flatMap((v, i) => (v ? [i] : [])));
          };
          check(
            and(A, B),
            a.map((v, i) => v && b[i]!),
          );
          check(
            or(A, B),
            a.map((v, i) => v || b[i]!),
          );
          check(
            not(A, n),
            a.map((v) => !v),
          );
        },
      ),
    );
  });
  it('full bitset has exactly n bits', () => {
    for (const n of [0, 1, 31, 32, 33, 1000]) expect(popcount(fullBitset(n))).toBe(n);
  });
});

describe('M-GATE-RECT boundary rule', () => {
  it('includes min and excludes max', () => {
    const x = Float64Array.from([0, 1, 2, 3, Number.NaN]);
    const r = evaluateGate({ kind: 'rect', min: [1], max: [3] }, [x], 5, null);
    expect(Array.from(toIndices(r.regions.in!))).toEqual([1, 2]);
  });
  it('treats null bounds as unbounded', () => {
    const x = Float64Array.from([-1e300, 0, 1e300]);
    const r = evaluateGate({ kind: 'rect', min: [null], max: [null] }, [x], 3, null);
    expect(popcount(r.regions.in!)).toBe(3);
  });
});

describe('M-GATE-QUAD', () => {
  it('assigns divider ties to the upper side and excludes NaN', () => {
    const x = Float64Array.from([0, 1, 1, 2, 0, Number.NaN]);
    const y = Float64Array.from([2, 1, 0, 0, 0, 1]);
    const r = evaluateGate({ kind: 'quadrant', center: [1, 1] }, [x, y], 6, null).regions;
    expect(Array.from(toIndices(r.Q1!))).toEqual([0]);
    expect(Array.from(toIndices(r.Q2!))).toEqual([1]);
    expect(Array.from(toIndices(r.Q3!))).toEqual([2, 3]);
    expect(Array.from(toIndices(r.Q4!))).toEqual([4]);
  });
});

describe('M-GATE-SPIDER', () => {
  it('equals the quadrant gate when arms are axis-aligned', () => {
    fc.assert(
      fc.property(coord, coord, fc.array(fc.tuple(coord, coord), { maxLength: 100 }), (cx, cy, pts) => {
        const x = Float64Array.from(pts.map((p) => p[0]));
        const y = Float64Array.from(pts.map((p) => p[1]));
        // include points exactly on the dividers
        const xs = Float64Array.from([...x, cx, cx, cx - 1, cx + 1, cx]);
        const ys = Float64Array.from([...y, cy + 1, cy - 1, cy, cy, cy]);
        const n = xs.length;
        const q = evaluateGate({ kind: 'quadrant', center: [cx, cy] }, [xs, ys], n, null).regions;
        const s = evaluateGate(
          { kind: 'spider', center: [cx, cy], arms: spiderFromQuadrant([cx, cy], 10) },
          [xs, ys],
          n,
          null,
        ).regions;
        for (const k of ['Q1', 'Q2', 'Q3', 'Q4'] as const)
          expect(Array.from(s[k]!)).toEqual(Array.from(q[k]!));
      }),
    );
  });

  const arm = (cx: number, cy: number, angleDeg: number): [number, number] => [
    cx + Math.cos((angleDeg * Math.PI) / 180),
    cy + Math.sin((angleDeg * Math.PI) / 180),
  ];

  it('partitions the plane: every non-NaN event is in exactly one region', () => {
    fc.assert(
      fc.property(
        coord,
        coord,
        fc.double({ min: 10, max: 170, noNaN: true }), // up
        fc.double({ min: -80, max: 80, noNaN: true }), // right
        fc.double({ min: 190, max: 350, noNaN: true }), // down
        fc.double({ min: 100, max: 260, noNaN: true }), // left
        fc.array(fc.tuple(coord, coord), { minLength: 1, maxLength: 100 }),
        (cx, cy, u, r, d, l, pts) => {
          const arms = [arm(cx, cy, u), arm(cx, cy, r), arm(cx, cy, d), arm(cx, cy, l)] as const;
          fc.pre(validateSpider([cx, cy], arms) === null);
          const x = Float64Array.from(pts.map((p) => p[0]));
          const y = Float64Array.from(pts.map((p) => p[1]));
          const res = evaluateGate(
            { kind: 'spider', center: [cx, cy], arms: [...arms] },
            [x, y],
            x.length,
            null,
          ).regions;
          const total = ['Q1', 'Q2', 'Q3', 'Q4'].reduce((a, k) => a + popcount(res[k as 'Q1']!), 0);
          expect(total).toBe(x.length);
        },
      ),
    );
  });

  it('assigns points along each arm direction to the expected sectors', () => {
    // arms at 100°, 10°, 280°, 190°; bisectors fall in Q2 (55°), Q3 (−35°), Q4 (235°), Q1 (145°)
    const c: [number, number] = [0, 0];
    const arms = [arm(0, 0, 100), arm(0, 0, 10), arm(0, 0, 280), arm(0, 0, 190)];
    const at = (deg: number) =>
      spiderRegion(0, 0, arms, Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
    expect(validateSpider(c, arms)).toBeNull();
    expect(at(55)).toBe(2);
    expect(at(-35)).toBe(3);
    expect(at(235)).toBe(4);
    expect(at(145)).toBe(1);
  });

  it('rejects arms out of angular order', () => {
    expect(
      validateSpider([0, 0], [arm(0, 0, 30), arm(0, 0, 60), arm(0, 0, 270), arm(0, 0, 180)]),
    ).not.toBeNull();
  });
});

describe('M-GATE-ELLIPSE', () => {
  it('ellipseFromAxes ↔ ellipseAxes round-trip and boundary inclusion', () => {
    const e = ellipseFromAxes(2, 3, 10, 5, Math.PI / 4);
    const back = ellipseAxes(e.mean, e.cov, e.d2);
    expect(back.a).toBeCloseTo(10, 10);
    expect(back.b).toBeCloseTo(5, 10);
    expect(back.theta).toBeCloseTo(Math.PI / 4, 10);
    // Gating-ML compliance "Ellipse1": half-axes 10 and 5, rotated 45° → Σ = [[62.5, 37.5], [37.5, 62.5]]
    expect(e.cov[0][0]).toBeCloseTo(62.5, 10);
    expect(e.cov[0][1]).toBeCloseTo(37.5, 10);
    const x = Float64Array.from([2, 2 + 10 * Math.SQRT1_2 * 0.999, 2 + 10 * Math.SQRT1_2 * 1.001]);
    const y = Float64Array.from([3, 3 + 10 * Math.SQRT1_2 * 0.999, 3 + 10 * Math.SQRT1_2 * 1.001]);
    const r = evaluateGate({ kind: 'ellipse', ...e }, [x, y], 3, null);
    expect(Array.from(toIndices(r.regions.in!))).toEqual([0, 1]);
  });
});

describe('parent restriction', () => {
  it('only events in the parent can be in the child', () => {
    const x = Float64Array.from([1, 2, 3, 4]);
    const parent = fromBooleans([true, false, true, false]);
    const r = evaluateGate({ kind: 'rect', min: [0], max: [10] }, [x], 4, parent);
    expect(Array.from(toIndices(r.regions.in!))).toEqual([0, 2]);
  });
});
