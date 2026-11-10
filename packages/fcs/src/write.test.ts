import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { writeDataNative, writeDataView } from './write.ts';

describe('M-FCS-WRITE: DATA through a Float32Array', () => {
  it('writes the same bytes as the DataView path', () => {
    const value = fc.oneof(
      fc.double(),
      fc.double({ min: -1e5, max: 1e6 }),
      fc.constantFrom(0, -0, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, 1e-45, 3.4e38),
    );
    const input = fc.record({
      par: fc.integer({ min: 1, max: 5 }),
      tot: fc.integer({ min: 0, max: 2100 }),
      start: fc.integer({ min: 0, max: 7 }),
      kind: fc.constantFrom('f64', 'f32', 'array'),
      pool: fc.array(value, { minLength: 1, maxLength: 50 }),
    });
    fc.assert(
      fc.property(input, ({ par, tot, start, kind, pool }) => {
        const values = Array.from({ length: par }, (_, c) => {
          const col = Array.from({ length: tot }, (_, e) => pool[(e * 7 + c * 3) % pool.length] as number);
          return kind === 'f64' ? Float64Array.from(col) : kind === 'f32' ? Float32Array.from(col) : col;
        });
        const a = new Uint8Array(start + tot * par * 4 + 3);
        const b = new Uint8Array(a.length);
        writeDataNative(a, start, values, tot);
        writeDataView(b, start, values, tot);
        expect(a).toEqual(b);
      }),
      { numRuns: 200 },
    );
  });
});
