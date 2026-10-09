import { invert } from '@flowmeris/compensation';
import type { Geometry } from '@flowmeris/model';
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
  inEllipsoid,
  inPolygon,
  inRange,
  not,
  or,
  popcount,
  preparePolygon,
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

describe('evaluateGate kernels agree with the per-event predicates', () => {
  // Coordinates with ties on gate boundaries, NaN and ±∞, over a partial parent.
  const value = fc.oneof(
    { weight: 6, arbitrary: fc.double({ min: -2, max: 2, noNaN: true }) },
    { weight: 2, arbitrary: fc.constantFrom(-1, -0.5, 0, 0.25, 0.5, 1, -0) },
    {
      weight: 1,
      arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
    },
  );
  const events = fc
    .integer({ min: 0, max: 150 })
    .chain((n) =>
      fc.tuple(
        fc.array(value, { minLength: n, maxLength: n }),
        fc.array(value, { minLength: n, maxLength: n }),
        fc.array(value, { minLength: n, maxLength: n }),
        fc.array(fc.boolean(), { minLength: n, maxLength: n }),
      ),
    );
  const bound = fc.option(fc.constantFrom(-1, -0.5, 0, 0.5, 1), { nil: null });

  /** Membership by the M-GATE predicates of geometry.ts, event by event (the specification). */
  function reference(geometry: Geometry, dims: number[][], parent: boolean[]): Record<string, boolean[]> {
    const x = dims[0]!;
    const y = dims[1]!;
    const keep = (f: (i: number) => boolean) => parent.map((p, i) => p && f(i));
    switch (geometry.kind) {
      case 'rect':
        return {
          in: keep((i) =>
            dims.every((d, k) => inRange(d[i]!, geometry.min[k] ?? null, geometry.max[k] ?? null)),
          ),
        };
      case 'polygon': {
        const p = preparePolygon(geometry.vertices);
        return { in: keep((i) => inPolygon(p, x[i]!, y[i]!)) };
      }
      case 'ellipse': {
        const inv = invert(geometry.cov.map((r) => [...r]));
        return { in: keep((i) => inEllipsoid([x[i]!, y[i]!], geometry.mean, inv, geometry.d2)) };
      }
      case 'quadrant': {
        const [cx, cy] = geometry.center;
        const q = (xp: boolean, yp: boolean) =>
          keep(
            (i) => !Number.isNaN(x[i]!) && !Number.isNaN(y[i]!) && x[i]! >= cx === xp && y[i]! >= cy === yp,
          );
        return { Q1: q(false, true), Q2: q(true, true), Q3: q(true, false), Q4: q(false, false) };
      }
      case 'spider': {
        const [cx, cy] = geometry.center;
        const r = (k: number) => keep((i) => spiderRegion(cx, cy, geometry.arms, x[i]!, y[i]!) === k);
        return { Q1: r(1), Q2: r(2), Q3: r(3), Q4: r(4) };
      }
      case 'split':
        return {
          lo: keep((i) => inRange(x[i]!, null, geometry.at)),
          hi: keep((i) => inRange(x[i]!, geometry.at, null)),
        };
    }
  }

  function check(geometry: Geometry, dims: number[][], parent: boolean[]) {
    const res = evaluateGate(geometry, dims, parent.length, fromBooleans(parent)).regions;
    for (const [r, want] of Object.entries(reference(geometry, dims, parent))) {
      const got = res[r as keyof typeof res]!;
      expect(got.length).toBe(Math.ceil(parent.length / 32));
      expect(want.map((_, i) => getBit(got, i))).toEqual(want);
    }
  }

  it('rect, 1–3 dimensions with open bounds', () => {
    fc.assert(
      fc.property(
        events,
        fc.integer({ min: 1, max: 3 }),
        fc.array(bound, { minLength: 6, maxLength: 6 }),
        ([x, y, z, par], d, b) => {
          check({ kind: 'rect', min: b.slice(0, d), max: b.slice(3, 3 + d) }, [x, y, z].slice(0, d), par);
        },
      ),
    );
  });

  it('polygon, including self-intersecting and degenerate ones', () => {
    const c = fc.constantFrom(-1, -0.5, 0, 0.5, 1, 1.5);
    fc.assert(
      fc.property(
        events,
        fc.array(fc.tuple(c, c), { minLength: 3, maxLength: 7 }),
        ([x, y, , par], vertices) => {
          check({ kind: 'polygon', vertices }, [x, y], par);
        },
      ),
    );
  });

  it('ellipse', () => {
    fc.assert(
      fc.property(
        events,
        fc.double({ min: 0.1, max: 1, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 3, noNaN: true }),
        ([x, y, , par], a, b, theta) => {
          const e = ellipseFromAxes(0.25, -0.5, Math.max(a, b), Math.min(a, b), theta);
          check({ kind: 'ellipse', ...e }, [x, y], par);
        },
      ),
    );
  });

  it('quadrant and spider', () => {
    fc.assert(
      fc.property(
        events,
        fc.constantFrom(-0.5, 0, 0.5),
        fc.constantFrom(-0.5, 0, 0.25),
        ([x, y, , par], cx, cy) => {
          check({ kind: 'quadrant', center: [cx, cy] }, [x, y], par);
          check(
            {
              kind: 'spider',
              center: [cx, cy],
              arms: [
                [cx + 0.2, cy + 1],
                [cx + 1, cy - 0.3],
                [cx - 0.1, cy - 1],
                [cx - 1, cy + 0.4],
              ],
            },
            [x, y],
            par,
          );
        },
      ),
    );
  });

  it('split: the two regions are disjoint and cover every non-NaN parent event', () => {
    fc.assert(
      fc.property(events, fc.constantFrom(-1, -0.5, 0, 0.5, 1), ([x, , , par], at) => {
        check({ kind: 'split', at }, [x], par);
        const r = evaluateGate({ kind: 'split', at }, [x], par.length, fromBooleans(par)).regions;
        par.forEach((p, i) => {
          const lo = getBit(r.lo!, i);
          const hi = getBit(r.hi!, i);
          expect(lo && hi).toBe(false);
          expect(lo || hi).toBe(p && !Number.isNaN(x[i]!));
        });
      }),
    );
  });

  it('toIndices lists set bits in ascending order, including full words', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.boolean(), fc.constant(true)), { maxLength: 300 }), (a) => {
        expect(Array.from(toIndices(fromBooleans(a)))).toEqual(a.flatMap((v, i) => (v ? [i] : [])));
      }),
    );
    expect(Array.from(toIndices(fullBitset(70)))).toEqual(Array.from({ length: 70 }, (_, i) => i));
  });
});
