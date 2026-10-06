import {
  TOL,
  accurateSum,
  compareArrays,
  hasFixture,
  isClose,
  readFixture,
  readGolden,
} from '@flowmeris/testkit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { linearize, parseFcs, parseTextSegment, writeFcs } from './index.ts';
import type { FcsWarning } from './types.ts';

describe('M-FCS-TEXT: TEXT segment parsing', () => {
  it('splits keyword/value pairs and upper-cases keywords', () => {
    const w: FcsWarning[] = [];
    expect(parseTextSegment('/$par/2/$Tot/10/', w)).toEqual({ $PAR: '2', $TOT: '10' });
    expect(w).toEqual([]);
  });
  it('decodes a doubled delimiter as a literal delimiter', () => {
    const w: FcsWarning[] = [];
    expect(parseTextSegment('/$FIL/a//b.fcs/$X/1/', w)).toEqual({ $FIL: 'a/b.fcs', $X: '1' });
  });
  it('supports arbitrary delimiter characters', () => {
    expect(parseTextSegment('|K|v||w|K2|x|', [])).toEqual({ K: 'v|w', K2: 'x' });
    expect(parseTextSegment('\fK\fv\f', [])).toEqual({ K: 'v' });
  });
  it('warns on missing trailing delimiter but keeps the value (Q-TEXT-NO-TRAILING-DELIM)', () => {
    const w: FcsWarning[] = [];
    expect(parseTextSegment('/A/1/B/2', w)).toEqual({ A: '1', B: '2' });
    expect(w.map((x) => x.code)).toContain('Q-TEXT-NO-TRAILING-DELIM');
  });
  it('keeps the first value of a duplicated keyword (Q-TEXT-DUP-KEY)', () => {
    const w: FcsWarning[] = [];
    expect(parseTextSegment('/A/1/a/2/', w)).toEqual({ A: '1' });
    expect(w.map((x) => x.code)).toContain('Q-TEXT-DUP-KEY');
  });
});

describe('M-FCS-WRITE: writer → parser round trip', () => {
  it('round-trips float32-representable data and keywords exactly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 50 }),
        fc.string({ maxLength: 12 }),
        (par, tot, note) => {
          const cols = Array.from({ length: par }, (_, c) =>
            Float32Array.from({ length: tot }, (_, e) => Math.fround((e - 7) * 1.37 + c * 1000.25)),
          );
          const bytes = writeFcs(
            cols.map((values, i) => ({
              pnn: `Ch/${i}`,
              pns: i === 0 ? 'CD3 / FITC' : undefined,
              values,
              range: 262144,
            })),
            { keywords: { NOTE: note } },
          );
          const ds = parseFcs(bytes).datasets[0]!;
          expect(ds.eventCount).toBe(tot);
          expect(ds.channels.map((c) => c.pnn)).toEqual(cols.map((_, i) => `Ch/${i}`));
          if (par > 0) expect(ds.channels[0]!.pns).toBe('CD3 / FITC');
          expect(ds.keywords.NOTE).toBe(note === '' ? ' ' : note);
          for (let c = 0; c < par; c++) expect(Array.from(ds.columns[c]!)).toEqual(Array.from(cols[c]!));
          expect(ds.warnings).toEqual([]);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('M-FCS-DATA: integer decoding', () => {
  function intFile(pnb: number, pnr: number, byteord: string, values: number[]): Uint8Array {
    const w = pnb / 8;
    const little = byteord.startsWith('1');
    const data = new Uint8Array(values.length * w);
    values.forEach((v, i) => {
      for (let k = 0; k < w; k++) {
        const b = Math.floor(v / 256 ** k) % 256;
        data[i * w + (little ? k : w - 1 - k)] = b;
      }
    });
    const text = `/$BYTEORD/${byteord}/$DATATYPE/I/$MODE/L/$PAR/1/$TOT/${values.length}/$P1N/FL1-H/$P1B/${pnb}/$P1R/${pnr}/$P1E/0,0/$BEGINDATA/0/$ENDDATA/0/`;
    const textStart = 58;
    const textEnd = textStart + text.length - 1;
    const dataStart = textEnd + 1;
    const dataEnd = dataStart + data.length - 1;
    const f = (x: number) => String(x).padStart(8, ' ');
    const header = `FCS3.0    ${f(textStart)}${f(textEnd)}${f(dataStart)}${f(dataEnd)}${f(0)}${f(0)}`;
    const out = new Uint8Array(dataEnd + 1);
    for (let i = 0; i < header.length; i++) out[i] = header.charCodeAt(i);
    for (let i = 0; i < text.length; i++) out[textStart + i] = text.charCodeAt(i);
    out.set(data, dataStart);
    return out;
  }

  it('reads little- and big-endian 16-bit integers', () => {
    for (const bo of ['1,2', '2,1', '1,2,3,4', '4,3,2,1']) {
      const ds = parseFcs(intFile(16, 1024, bo, [0, 1, 513, 1023])).datasets[0]!;
      expect(Array.from(ds.columns[0]!)).toEqual([0, 1, 513, 1023]);
    }
  });
  it('masks bits above the next power of two of $PnR', () => {
    // PnR = 1000 → next power of two 1024 → value mod 1024
    const ds = parseFcs(intFile(16, 1000, '1,2,3,4', [1023, 1024, 1025, 65535])).datasets[0]!;
    expect(Array.from(ds.columns[0]!)).toEqual([1023, 0, 1, 1023]);
  });
  it('reads 32-bit unsigned integers into float64 columns', () => {
    const ds = parseFcs(intFile(32, 4294967296, '4,3,2,1', [4294967295, 7])).datasets[0]!;
    expect(ds.columns[0]).toBeInstanceOf(Float64Array);
    expect(Array.from(ds.columns[0]!)).toEqual([4294967295, 7]);
  });
});

describe('M-FCS-LIN: linearisation', () => {
  it('applies log decoding then gain (FlowKit order)', () => {
    const y = linearize([0, 512, 1024], { logDecades: 4, logOffset: 1, range: 1024, gain: 2, timestep: 1 });
    expect(Array.from(y)).toEqual([0.5, 50, 5000]);
  });
  it('applies timestep to the time channel', () => {
    const y = linearize([0, 10], { logDecades: 0, logOffset: 0, range: 1024, gain: 1, timestep: 0.01 });
    expect(Array.from(y)).toEqual([0, 0.1]);
  });
});

// ---------------------------------------------------------------------------
// Golden parity with FlowKit (tools/golden/python/generate.py)
// ---------------------------------------------------------------------------

interface FcsGolden {
  file: string;
  version: string;
  event_count: number;
  pnn: string[];
  pns: string[];
  png: number[];
  pnr: number[];
  rows: number[];
  raw_rows: (number | null)[][];
  col_sum: number[];
  col_min: number[];
  col_max: number[];
}

const index =
  readGolden<{ file: string; golden?: string; events?: number; flowkit_error?: string }[]>('fcs/index.json');

describe('golden parity: FCS parsing + linearisation vs FlowKit', () => {
  for (const entry of index) {
    if (!entry.golden) continue;
    const run = hasFixture(entry.file) ? it : it.skip;
    run(entry.file, () => {
      const g = readGolden<FcsGolden>(entry.golden!);
      const ds = parseFcs(readFixture(entry.file)).datasets[0]!;
      expect(`FCS${g.version}`.replace('FCSFCS', 'FCS')).toContain(ds.header.version.slice(3));
      expect(ds.eventCount).toBe(g.event_count);
      expect(ds.channels.map((c) => c.pnn)).toEqual(g.pnn);
      const lin = ds.channels.map((c, i) => linearize(ds.columns[i]!, c.scaling));
      const errors: string[] = [];
      g.rows.forEach((r, k) => {
        errors.push(
          ...compareArrays(
            lin.map((col) => col[r]!),
            g.raw_rows[k]!,
            TOL.linearize,
            `row ${r}`,
          ),
        );
      });
      lin.forEach((col, j) => {
        const s = accurateSum(col);
        if (!isClose(s, g.col_sum[j]!, { rel: 1e-12, abs: 1e-9 }))
          errors.push(`sum ch${j}: ${s} ≠ ${g.col_sum[j]}`);
        let mn = Number.POSITIVE_INFINITY;
        let mx = Number.NEGATIVE_INFINITY;
        for (const v of col) {
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (g.event_count > 0) {
          if (!isClose(mn, g.col_min[j]!, TOL.linearize)) errors.push(`min ch${j}: ${mn} ≠ ${g.col_min[j]}`);
          if (!isClose(mx, g.col_max[j]!, TOL.linearize)) errors.push(`max ch${j}: ${mx} ≠ ${g.col_max[j]}`);
        }
      });
      expect(errors).toEqual([]);
    });
  }
});

describe('files FlowKit cannot read', () => {
  it('reads every dataset of a multi-dataset file ($NEXTDATA)', () => {
    const f = parseFcs(readFixture('flowio/coulter.lmd'));
    expect(f.datasets.length).toBeGreaterThan(1);
    for (const ds of f.datasets) {
      expect(ds.eventCount).toBeGreaterThan(0);
      expect(ds.columns.length).toBe(ds.channels.length);
    }
  });
  it.each([
    'flowio/variable_int_example.fcs',
    'flowio/data_start_offset_discrepancy_example.fcs',
    'flowio/data_stop_offset_discrepancy_example.fcs',
  ])('parses %s with documented warnings', (file) => {
    const ds = parseFcs(readFixture(file)).datasets[0]!;
    expect(ds.eventCount).toBeGreaterThan(0);
    for (const c of ds.columns) expect(c.length).toBe(ds.eventCount);
  });
});
