import type { Transform } from '@flowmeris/model';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeScale } from './index.ts';

const defs: Transform[] = [
  { kind: 'flin', T: 262144, A: 100 },
  { kind: 'flog', T: 262144, M: 4.5 },
  { kind: 'fasinh', T: 262144, M: 4.5, A: 0.5 },
  { kind: 'logicle', T: 262144, W: 0.5, M: 4.5, A: 0 },
  { kind: 'logicle', T: 10000, W: 0, M: 4, A: 1 },
  { kind: 'hyperlog', T: 262144, W: 0.5, M: 4.5, A: 0 },
  { kind: 'biex', T: 262144, width: -10, pos: 4.41854, neg: 0 },
  { kind: 'miltenyi', T: 262144, M: 4, L: 1 },
];

const value = fc.oneof(
  fc.double(),
  fc.double({ min: -1e4, max: 3e5 }),
  fc.constantFrom(
    0,
    -0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1e308,
    -1e308,
    5e-324,
  ),
);

describe('Scale.applyArray', () => {
  for (const def of defs) {
    it(`${def.kind}: is bit-identical to apply on every element`, () => {
      const s = makeScale(def);
      fc.assert(
        fc.property(fc.array(value, { maxLength: 64 }), fc.boolean(), (xs, f32) => {
          const src = f32 ? Float32Array.from(xs) : xs;
          const got = s.applyArray(src);
          for (let i = 0; i < src.length; i++)
            expect(Object.is(got[i], s.apply(src[i] as number))).toBe(true);
        }),
        { numRuns: 200 },
      );
    });
  }
});
