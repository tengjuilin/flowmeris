import type { Transform } from '@flowmeris/model';
import { TOL, compareArrays, readGolden } from '@flowmeris/testkit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  Logicle,
  asinhCofactor,
  asinhDefFromCofactor,
  axisTicks,
  formatPow10,
  makeScale,
  suggestLogicleW,
} from './index.ts';

interface Case {
  kind: Transform['kind'];
  params: Record<string, number>;
  x: (number | null)[];
  y: (number | null)[];
}

const cases = readGolden<Case[]>('transforms.json');

describe('golden parity: transforms vs FlowKit/flowutils', () => {
  for (const c of cases) {
    it(`${c.kind} ${JSON.stringify(c.params)}`, () => {
      const s = makeScale({ kind: c.kind, ...c.params } as Transform);
      const xs = c.x.map((v) => v as number);
      const ys = xs.map((x) => s.apply(x));
      expect(compareArrays(ys, c.y, TOL.transform, c.kind)).toEqual([]);
    });
  }
});

describe('golden parity: inverse transforms vs FlowKit/flowutils', () => {
  for (const c of readGolden<
    { kind: Transform['kind']; params: Record<string, number>; y: number[]; x: (number | null)[] }[]
  >('transforms_inverse.json')) {
    it(`${c.kind} ${JSON.stringify(c.params)}`, () => {
      const s = makeScale({ kind: c.kind, ...c.params } as Transform);
      expect(
        compareArrays(
          c.y.map((y) => s.inverse(y)),
          c.x,
          TOL.transform,
          c.kind,
        ),
      ).toEqual([]);
    });
  }
});

describe('M-TR-LOGICLE properties', () => {
  it('maps 0 to x1 = (W + A)/(M + A) and T to 1', () => {
    const l = new Logicle(262144, 0.5, 4.5, 0);
    expect(l.scale(0)).toBe(0.5 / 4.5);
    expect(l.scale(262144)).toBeCloseTo(1, 14);
  });
  it('inverse ∘ forward is the identity and forward is strictly monotone', () => {
    const params = fc.record({
      T: fc.constantFrom(1000, 10000, 262144),
      M: fc.double({ min: 3, max: 6, noNaN: true }),
      wf: fc.oneof(fc.constant(0), fc.double({ min: 1e-6, max: 0.5, noNaN: true })),
      af: fc.double({ min: 0, max: 0.5, noNaN: true }),
    });
    fc.assert(
      fc.property(params, fc.double({ min: -1e4, max: 1e6, noNaN: true }), ({ T, M, wf, af }, x) => {
        const W = wf * M * 0.99;
        const A = af * (M - 2 * W) * 0.99;
        const l = new Logicle(T, W, M, A);
        const y = l.scale(x);
        const back = l.inverse(y);
        expect(Math.abs(back - x)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(x)));
        expect(l.scale(x + Math.max(1e-3, Math.abs(x) * 1e-6))).toBeGreaterThan(y);
      }),
      { numRuns: 300 },
    );
  });
  it('rejects invalid parameters', () => {
    expect(() => new Logicle(262144, 3, 4.5, 0)).toThrow();
    expect(() => new Logicle(0, 0.5, 4.5, 0)).toThrow();
  });
});

describe('M-TR-FASINH cofactor parameterisation', () => {
  it('fasinh with cofactor c equals asinh(x/c)/asinh(T/c) when A = 0', () => {
    const def = asinhDefFromCofactor(150, 262144);
    expect(asinhCofactor(def as Extract<Transform, { kind: 'fasinh' }>)).toBeCloseTo(150, 9);
    const s = makeScale(def);
    for (const x of [-1000, -5, 0, 5, 1000, 1e5]) {
      expect(s.apply(x)).toBeCloseTo(Math.asinh(x / 150) / Math.asinh(262144 / 150), 12);
      expect(s.inverse(s.apply(x))).toBeCloseTo(x, 6);
    }
  });
});

describe('M-TR-LOGNP: log of non-positive values', () => {
  it('returns NaN for x ≤ 0', () => {
    const s = makeScale({ kind: 'flog', T: 262144, M: 4.5 });
    expect(s.apply(0)).toBeNaN();
    expect(s.apply(-1)).toBeNaN();
    expect(s.apply(262144)).toBe(1);
  });
});

describe('axis ticks', () => {
  it('labels decades on a logicle axis and keeps 0', () => {
    const s = makeScale({ kind: 'logicle', T: 262144, W: 0.5, M: 4.5, A: 0 });
    const ticks = axisTicks(s.def, s.apply, s.inverse, 0, 1);
    const labels = ticks.filter((t) => t.label).map((t) => t.label);
    expect(labels).toContain('0');
    expect(labels).toContain(formatPow10(1, 5));
    expect(labels).toContain(formatPow10(1, 3));
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!.pos).toBeGreaterThanOrEqual(ticks[i - 1]!.pos);
  });
  it('produces nice ticks on a linear axis', () => {
    const s = makeScale({ kind: 'flin', T: 262144, A: 0 });
    const ticks = axisTicks(s.def, s.apply, s.inverse, 0, 1);
    expect(ticks.map((t) => t.value)).toEqual([0, 50000, 100000, 150000, 200000, 250000]);
  });
});

describe('suggestLogicleW', () => {
  it('returns 0 without negative data and a value within [0, M/2] otherwise', () => {
    expect(suggestLogicleW([1, 2, 3], 262144, 4.5)).toBe(0);
    const w = suggestLogicleW([-500, -100, -10, 5, 1000], 262144, 4.5);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(2.25);
  });
});
