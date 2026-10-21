import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Biex, Miltenyi, axisTicks, biexDef, makeScale, miltenyiDef } from './index.ts';

describe('M-TR-BIEX properties', () => {
  it('table is strictly increasing for valid parameters', () => {
    const params = fc.record({
      T: fc.constantFrom(1000, 10000, 262144),
      width: fc.double({ min: -1000, max: -1, noNaN: true }),
      pos: fc.double({ min: 2, max: 6, noNaN: true }),
      neg: fc.double({ min: 0, max: 2, noNaN: true }),
    });
    fc.assert(
      fc.property(params, ({ T, width, pos, neg }) => {
        const t = new Biex(T, width, pos, neg).table;
        for (let i = 1; i < t.length; i++) if (!(t[i]! > t[i - 1]!)) return false;
        return true;
      }),
    );
  });
  it('inverse ∘ forward is the identity inside the table and holds at its ends', () => {
    const b = new Biex(262144, -10, 4.41854, 0);
    const lo = b.table[0]!;
    const hi = b.table[b.table.length - 1]!;
    fc.assert(
      fc.property(fc.double({ min: lo, max: hi, noNaN: true }), (x) => {
        expect(b.inverse(b.scale(x))).toBeCloseTo(x, 6);
      }),
    );
    expect(b.scale(lo - 1e6)).toBe(0);
    expect(b.scale(hi * 10)).toBe(1);
    expect(b.inverse(-0.5)).toBe(lo);
    expect(b.inverse(2)).toBe(hi);
    expect(b.scale(Number.NaN)).toBeNaN();
  });
  it('rejects a width basis above −1', () => {
    expect(() => makeScale({ kind: 'biex', T: 262144, width: -0.5, pos: 4.4, neg: 0 })).toThrow(/Biex/);
  });
  it('leaves out ticks past the ends of the table', () => {
    const s = makeScale(biexDef());
    const ticks = axisTicks(s.def, s.apply, s.inverse, 0, 1);
    expect(ticks.map((t) => t.value)).not.toContain(-1000);
    expect(ticks.map((t) => t.value)).not.toContain(1e6);
    expect(ticks.some((t) => t.value === 0)).toBe(true);
  });
});

describe('M-TR-MILTENYI properties', () => {
  it('maps T to 1, x0 = T·10^−M to L/(M+L), and is smooth at x0', () => {
    const m = new Miltenyi(262144, 4, 1);
    const x0 = 262144e-4;
    expect(m.scale(262144)).toBeCloseTo(1, 14);
    expect(m.scale(x0)).toBeCloseTo(0.2, 14);
    const h = x0 * 1e-6;
    const left = (m.scale(x0) - m.scale(x0 - h)) / h;
    const right = (m.scale(x0 + h) - m.scale(x0)) / h;
    expect(left / right).toBeCloseTo(1, 5);
    expect(m.scale(0)).toBeCloseTo((1 - 1 / Math.LN10) / 5, 14);
  });
  it('inverse ∘ forward is the identity and forward is strictly monotone', () => {
    const params = fc.record({
      T: fc.constantFrom(1000, 10000, 262144),
      M: fc.double({ min: 1, max: 6, noNaN: true }),
      L: fc.double({ min: 0, max: 3, noNaN: true }),
    });
    fc.assert(
      fc.property(params, fc.double({ min: -1e4, max: 1e6, noNaN: true }), ({ T, M, L }, x) => {
        const s = makeScale(miltenyiDef(T, M, L));
        const back = s.inverse(s.apply(x));
        expect(Math.abs(back - x)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(x)));
        expect(s.apply(x + Math.max(1e-3, Math.abs(x) * 1e-6))).toBeGreaterThan(s.apply(x));
      }),
    );
  });
});
