import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeData } from './data.ts';
import { HOST_LITTLE_ENDIAN } from './dataNative.ts';
import type { FcsChannel, FcsWarning } from './types.ts';

function channel(n: number, dataType: 'F' | 'I', pnb: number, pnr: number): FcsChannel {
  return {
    n,
    pnn: `C${n}`,
    pnb,
    pnr,
    pne: [0, 0],
    dataType,
    kind: 'fluor',
    scaling: { logDecades: 0, logOffset: 0, range: pnr, gain: 1, timestep: 1 },
  };
}

const bytesOf = (c: ArrayBufferView) => new Uint8Array(c.buffer, c.byteOffset, c.byteLength);

describe('M-FCS-DATA: typed-array fast path', () => {
  it('runs on a little-endian host', () => {
    expect(HOST_LITTLE_ENDIAN).toBe(true);
  });
  it('decodes the same columns as the per-channel DataView reads', () => {
    const layout = fc.record({
      type: fc.constantFrom('F', 'I16', 'I32'),
      par: fc.integer({ min: 1, max: 6 }),
      n: fc.integer({ min: 0, max: 40 }),
      offset: fc.integer({ min: 0, max: 7 }),
      extra: fc.integer({ min: 0, max: 5 }),
      little: fc.boolean(),
      pnrs: fc.array(fc.constantFrom(1, 7, 1000, 1024, 65536, 2 ** 20, 2 ** 32, Number.NaN), {
        minLength: 6,
        maxLength: 6,
      }),
      seed: fc.integer(),
    });
    fc.assert(
      fc.property(layout, ({ type, par, n, offset, extra, little, pnrs, seed }) => {
        const w = type === 'I16' ? 2 : 4;
        const channels = Array.from({ length: par }, (_, i) =>
          channel(i + 1, type === 'F' ? 'F' : 'I', w * 8, pnrs[i] as number),
        );
        const size = n * par * w + extra;
        const buf = new Uint8Array(offset + size);
        let x = seed | 1;
        for (let i = 0; i < buf.length; i++) {
          x ^= x << 13;
          x ^= x >>> 17;
          x ^= x << 5;
          buf[i] = x & 0xff;
        }
        const data = buf.subarray(offset);
        const byteord = little ? '1,2,3,4' : '4,3,2,1';
        const w1: FcsWarning[] = [];
        const w2: FcsWarning[] = [];
        const fast = decodeData(data, channels, n, byteord, w1);
        const ref = decodeData(data, channels, n, byteord, w2, false);
        expect(fast.eventCount).toBe(ref.eventCount);
        expect(w1).toEqual(w2);
        for (let c = 0; c < par; c++) {
          const a = fast.columns[c] as Float32Array | Float64Array;
          const b = ref.columns[c] as Float32Array | Float64Array;
          expect(a.constructor).toBe(b.constructor);
          // Every value has the same bits, except that a NaN may differ in its quiet bit: the
          // DataView path quiets signaling NaNs or not depending on the JIT tier.
          for (let k = 0; k < a.length; k++) {
            if (Number.isNaN(b[k])) expect(a[k]).toBeNaN();
            else expect(Object.is(a[k], b[k])).toBe(true);
          }
          const nan = (v: number) => Number.isNaN(v);
          if (!b.some(nan)) expect(bytesOf(a)).toEqual(bytesOf(b));
        }
      }),
      { numRuns: 500 },
    );
  });
});
