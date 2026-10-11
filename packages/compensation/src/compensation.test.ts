import { linearize, parseFcs } from '@flowmeris/fcs';
import { TOL, compareArrays, hasFixture, readFixture, readGolden } from '@flowmeris/testkit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  compensateChannel,
  conditionNumber,
  findSpillover,
  formatSpilloverKeyword,
  invert,
  makeCompensator,
  parseMatrixCsv,
  parseSpilloverKeyword,
} from './index.ts';

describe('M-COMP-PARSE', () => {
  it('parses and re-serializes a $SPILLOVER keyword', () => {
    const v = '2,FL1-A,FL2-A,1,0.1,0.02,1';
    const m = parseSpilloverKeyword(v)!;
    expect(m).toEqual({
      detectors: ['FL1-A', 'FL2-A'],
      spill: [
        [1, 0.1],
        [0.02, 1],
      ],
    });
    expect(formatSpilloverKeyword(m)).toBe(v);
  });
  it('rejects a keyword with the wrong number of fields', () => {
    expect(() => parseSpilloverKeyword('2,A,B,1,0,0')).toThrow();
  });
  it('treats n = 0 as no matrix', () => {
    expect(parseSpilloverKeyword('0')).toBeNull();
  });
});

describe('M-COMP-INV: LU inverse', () => {
  it('S · S⁻¹ = I for random diagonally dominant spillover matrices', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.integer(), (n, seed) => {
        let s = seed;
        const rnd = () => {
          s = (Math.imul(s, 1103515245) + 12345) | 0;
          return ((s >>> 0) % 10000) / 10000;
        };
        const m = Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => (i === j ? 1 : rnd() * 0.3)),
        );
        const inv = invert(m);
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            let acc = 0;
            for (let k = 0; k < n; k++) acc += m[i]![k]! * inv[k]![j]!;
            expect(Math.abs(acc - (i === j ? 1 : 0))).toBeLessThan(1e-12);
          }
      }),
    );
  });
  it('reports the condition number of the identity as 1', () => {
    expect(
      conditionNumber([
        [1, 0],
        [0, 1],
      ]),
    ).toBe(1);
  });
});

describe('golden parity: compensation vs FlowKit', () => {
  const file = 'remote/101_DEN084Y5_15_E01_008_clean.fcs';
  const run = hasFixture(file) ? it : it.skip;
  run('8-color sample with $SPILLOVER keyword', () => {
    const g = readGolden<{ rows: number[]; comp_rows: (number | null)[][] }>('comp_spill_8color.json');
    const ds = parseFcs(readFixture(file)).datasets[0]!;
    const found = findSpillover(ds.keywords);
    expect(found).not.toBeNull();
    expect(found!.matrix.detectors.length).toBe(8);
    const names = ds.channels.map((c) => c.pnn);
    const lin = ds.channels.map((c, i) => linearize(ds.columns[i]!, c.scaling));
    const comp = makeCompensator(found!.matrix, names);
    const cols = lin.map((col, i) => compensateChannel(comp, lin, i) ?? col);
    const errors: string[] = [];
    g.rows.forEach((r, k) => {
      errors.push(
        ...compareArrays(
          cols.map((c) => c[r]!),
          g.comp_rows[k]!,
          TOL.compensation,
          `row ${r}`,
        ),
      );
    });
    expect(errors).toEqual([]);
  });

  it('test_comp_example.fcs with comp_complete_example.csv', () => {
    const g = readGolden<{ rows: number[]; comp_rows: (number | null)[][] }>('comp_csv.json');
    const ds = parseFcs(readFixture('flowkit/test_comp_example.fcs')).datasets[0]!;
    const m = parseMatrixCsv(new TextDecoder().decode(readFixture('flowkit/comp_complete_example.csv')));
    const names = ds.channels.map((c) => c.pnn);
    const lin = ds.channels.map((c, i) => linearize(ds.columns[i]!, c.scaling));
    const comp = makeCompensator(m, names);
    const cols = lin.map((col, i) => compensateChannel(comp, lin, i) ?? col);
    const errors: string[] = [];
    g.rows.forEach((r, k) => {
      errors.push(
        ...compareArrays(
          cols.map((c) => c[r]!),
          g.comp_rows[k]!,
          TOL.compensation,
          `row ${r}`,
        ),
      );
    });
    expect(errors).toEqual([]);
  });
});
