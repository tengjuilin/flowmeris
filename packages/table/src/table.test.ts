import type { AggFunc, DerivedColumn } from '@flowmeris/model';
import { TOL, isClose, readGolden } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import {
  type Table,
  aggregate,
  applyDerived,
  detectPlateGrid,
  evalExpr,
  gridToRecords,
  inferType,
  matchSamples,
  normalizeWell,
  parseDelimited,
  parseExpr,
  suggestKey,
  summaryForPlot,
  wellFromSample,
} from './index.ts';

describe('formulas', () => {
  const run = (src: string, vars: Record<string, number> = {}) =>
    evalExpr(parseExpr(src), (n) => vars[n] ?? Number.NaN);

  it('follows arithmetic precedence', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('-2^2')).toBe(-4);
    expect(run('2^3^2')).toBe(512);
    expect(run('2^-1')).toBe(0.5);
    expect(run('10 / 4 - 1')).toBe(1.5);
    expect(run('1e3 + .5')).toBe(1000.5);
  });

  it('evaluates functions and column references', () => {
    expect(run('[Median PE] / [Median FITC]', { 'Median PE': 30, 'Median FITC': 10 })).toBe(3);
    expect(run('log10([x])', { x: 1000 })).toBeCloseTo(3, 12);
    expect(run('max(1, [a], 3)', { a: 5 })).toBe(5);
    expect(run('ln([x])', { x: Math.E })).toBeCloseTo(1, 12);
    expect(run('log([x], 3)', { x: 81 })).toBeCloseTo(4, 12);
    expect(run('log(1000, 10)')).toBeCloseTo(3, 12);
    expect(run('log(8, [b])', { b: 2 })).toBeCloseTo(3, 12);
    expect(run('log(5, 1)')).toBe(Number.POSITIVE_INFINITY); // base 1: ln 5 / 0
    expect(run('log(-1, 2)')).toBeNaN();
    expect(run('[missing] + 1')).toBeNaN();
  });

  it('reports errors with positions', () => {
    expect(() => parseExpr('1 +')).toThrow(/end/);
    expect(() => parseExpr('foo(1)')).toThrow(/Unknown function/);
    expect(() => parseExpr('[a')).toThrow(/Unclosed/);
    expect(() => parseExpr('1 2')).toThrow(/Unexpected/);
    expect(() => parseExpr('sqrt(1, 2)')).toThrow(/argument/);
    expect(() => parseExpr('log(1, 2, 3)')).toThrow(/takes 2 argument/);
    expect(() => parseExpr('log(8)')).toThrow(/needs a base/);
  });
});

function design(): Table {
  // Two groups × two doses × two replicates.
  const rows = [
    ['ctl', 0, 'r1', 10],
    ['ctl', 0, 'r2', 20],
    ['ctl', 1, 'r1', 30],
    ['ctl', 1, 'r2', 60],
    ['drug', 0, 'r1', 5],
    ['drug', 1, 'r1', 50],
    ['drug', 1, 'r2', 70],
  ] as const;
  return {
    columns: [
      { key: 'sample:name', label: 'Sample', type: 'categorical', kind: 'sample' },
      { key: 'var:g', label: 'Group', type: 'categorical', kind: 'variable' },
      { key: 'var:dose', label: 'Dose', type: 'numeric', kind: 'variable' },
      { key: 'var:rep', label: 'Replicate', type: 'categorical', kind: 'variable' },
      { key: 'st1', label: 'MFI', type: 'numeric', kind: 'stat' },
    ],
    rows: rows.map(([g, dose, rep, v], i) => ({
      id: `s${i}`,
      values: { 'sample:name': `s${i}`, 'var:g': g, 'var:dose': dose, 'var:rep': rep, st1: v },
    })),
  };
}

describe('derived columns', () => {
  it('adds formula columns that can chain', () => {
    const { table, errors } = applyDerived(design(), [
      { id: 'a', name: 'Double', kind: 'formula', expr: '2 * [MFI]' },
      { id: 'b', name: 'Quad', kind: 'formula', expr: '[Double] * 2' },
      { id: 'c', name: 'Bad', kind: 'formula', expr: '[Nope] +' },
    ]);
    expect(table.rows[0]!.values['derived:a']).toBe(20);
    expect(table.rows[0]!.values['derived:b']).toBe(40);
    expect(table.rows[0]!.values['derived:c']).toBeNaN();
    expect(errors.c).toBeDefined();
    expect(errors.a).toBeUndefined();
  });

  it('normalizes to the mean of reference rows within matching variables', () => {
    const { table } = applyDerived(design(), [
      {
        id: 'n',
        name: 'Fold',
        kind: 'normalize',
        source: 'st1',
        refVariable: 'dose',
        refValue: 0,
        within: ['g'],
        mode: 'ratio',
      },
      {
        id: 'p',
        name: 'Pct',
        kind: 'normalize',
        source: 'st1',
        refVariable: 'dose',
        refValue: '0',
        within: ['g', 'rep'],
        mode: 'percent',
      },
    ]);
    const v = (i: number, k: string) => table.rows[i]!.values[k];
    // ctl reference mean = 15
    expect(v(3, 'derived:n')).toBe(4);
    // drug reference = 5
    expect(v(6, 'derived:n')).toBe(14);
    // per replicate: ctl r2 dose 1 → 60 / 20
    expect(v(3, 'derived:p')).toBe(300);
    // drug r2 has no dose-0 reference
    expect(v(6, 'derived:p')).toBeNaN();
  });
});

describe('aggregation', () => {
  it('groups by variables and summarizes numeric columns', () => {
    const t = aggregate(design(), ['var:g', 'var:dose'], ['mean', 'sd', 'sem', 'n', 'ci95'], (k) =>
      k === 'var:g' ? ['drug', 'ctl'] : undefined,
    );
    expect(t.rows.map((r) => [r.values['var:g'], r.values['var:dose']])).toEqual([
      ['drug', 0],
      ['drug', 1],
      ['ctl', 0],
      ['ctl', 1],
    ]);
    const ctl1 = t.rows[3]!.values;
    expect(ctl1['group:n']).toBe(2);
    expect(ctl1['st1#mean']).toBe(45);
    expect(ctl1['st1#sd']).toBeCloseTo(Math.sqrt(450), 12);
    expect(ctl1['st1#sem']).toBeCloseTo(15, 12);
    expect(ctl1['st1#ci95']).toBeCloseTo(12.706204736174698 * 15, 8);
    expect(t.rows[0]!.values['st1#sd']).toBeNaN();
    // The replicate (categorical, not grouped) and sample columns are dropped; dose is a by-column.
    expect(t.columns.map((c) => c.key)).toEqual([
      'var:g',
      'var:dose',
      'group:n',
      'st1#mean',
      'st1#sd',
      'st1#sem',
      'st1#ci95',
    ]);
    expect(t.rows[3]!.members).toEqual(['s2', 's3']);
  });

  it('summarizes for charts by series and x', () => {
    const s = summaryForPlot(design().rows, 'var:dose', 'st1', 'var:g', 'sd');
    expect(s.map((x) => x.key)).toEqual(['ctl', 'drug']);
    expect(s[0]!.points.map((p) => [p.x, p.mean, p.n])).toEqual([
      [0, 15, 2],
      [1, 45, 2],
    ]);
    expect(s[0]!.points[0]!.err).toBeCloseTo(Math.sqrt(50), 12);
    expect(s[1]!.points[0]!.err).toBeNaN();
  });
});

describe('wells', () => {
  it('normalizes well names', () => {
    expect(normalizeWell('b7')).toBe('B07');
    expect(normalizeWell(' H12 ')).toBe('H12');
    expect(normalizeWell('A13')).toBeUndefined();
    expect(normalizeWell('I1')).toBeUndefined();
    expect(normalizeWell('B007')).toBe('B07');
  });

  it('reads the well keyword, then the file name', () => {
    expect(wellFromSample({ keywords: { $WELLID: 'B01' }, fileName: 'x.fcs' })).toBe('B01');
    expect(wellFromSample({ keywords: { 'WELL ID': 'c3' }, fileName: 'x.fcs' })).toBe('C03');
    expect(wellFromSample({ keywords: {}, fileName: 'Specimen_001_B07_019.fcs' })).toBe('B07');
    expect(wellFromSample({ keywords: {}, fileName: '01-Well-D11.fcs' })).toBe('D11');
    expect(wellFromSample({ keywords: {}, fileName: 'A1_vs_B2.fcs' })).toBeUndefined();
    expect(wellFromSample({ keywords: {}, fileName: 'CD4 stain.fcs' })).toBeUndefined();
  });
});

describe('import', () => {
  it('parses CSV with quotes and detects delimiters', () => {
    expect(parseDelimited('a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(parseDelimited('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseDelimited('a;b\n1,5;2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });

  it('turns grids into records and infers types', () => {
    const r = gridToRecords([
      ['', ''],
      ['file', 'dose', ''],
      ['a.fcs', '1'],
      ['b.fcs', '2.5', 'x'],
    ]);
    expect(r.headers).toEqual(['file', 'dose', 'Column 3']);
    expect(r.rows).toEqual([
      ['a.fcs', '1', ''],
      ['b.fcs', '2.5', 'x'],
    ]);
    expect(inferType(['1', '', '-2e-3'])).toBe('numeric');
    expect(inferType(['1', 'a'])).toBe('categorical');
    expect(inferType(['', ''])).toBe('categorical');
  });

  it('detects plate-layout blocks', () => {
    const block = (name: string, f: (r: number, c: number) => string) => [
      [name, ...Array.from({ length: 12 }, (_, i) => String(i + 1))],
      ...'ABCDEFGH'.split('').map((L, r) => [L, ...Array.from({ length: 12 }, (_, c) => f(r, c))]),
      [],
    ];
    const grid = [...block('Dose', (_, c) => String(2 ** c)), ...block('Group', (r) => (r < 4 ? 'ctl' : ''))];
    const b = detectPlateGrid(grid);
    expect(b.map((x) => x.name)).toEqual(['Dose', 'Group']);
    expect(b[0]!.values.C05).toBe('16');
    expect(b[1]!.values.D12).toBe('ctl');
    expect(b[1]!.values.E01).toBeUndefined();
  });

  it('matches records to samples', () => {
    const targets = [
      { id: '1', fileName: 'Plate1_A01.fcs', name: 'A01', well: 'A01' },
      { id: '2', fileName: 'Plate1_A02.fcs', name: 'A02', well: 'A02' },
    ];
    const rows = [
      ['a1', 'plate1_a01.fcs'],
      ['A02', 'nope'],
      ['B1', ''],
    ];
    expect(matchSamples(rows, 0, 'well', targets)).toEqual({
      byRow: [['1'], ['2'], []],
      matched: 2,
      unmatchedRows: [2],
    });
    expect(matchSamples(rows, 1, 'fileName', targets).matched).toBe(1);
    expect(suggestKey(rows, 2, targets)).toEqual({ column: 0, mode: 'well', matched: 2 });
  });
});

interface Summary {
  n: number;
  mean: number | null;
  sd: number | null;
  sem: number | null;
  ci95: number | null;
  median: number | null;
  cv: number | null;
  min: number | null;
  max: number | null;
}

interface PipelineGolden {
  rows: { id: string; cond: string; dose: number; rep: number; A: number | null; B: number | null }[];
  formulas: { id: string; expr: string; y: (number | null)[] }[];
  normalize: {
    id: string;
    mode: 'ratio' | 'percent' | 'difference';
    within: string[];
    y: (number | null)[];
  }[];
  groups: {
    cond: string;
    dose: number;
    rows: number;
    A: Summary;
    B: Summary;
    pandas: Record<string, number | null>;
  }[];
}

describe('golden parity: statistics table vs NumPy, SciPy and pandas', () => {
  const g = readGolden<PipelineGolden>('table_pipeline.json');
  const table: Table = {
    columns: [
      { key: 'sample:name', label: 'Sample', type: 'categorical', kind: 'sample' },
      { key: 'var:cond', label: 'cond', type: 'categorical', kind: 'variable' },
      { key: 'var:dose', label: 'dose', type: 'numeric', kind: 'variable' },
      { key: 'var:rep', label: 'rep', type: 'numeric', kind: 'variable' },
      { key: 'stA', label: 'A', type: 'numeric', kind: 'stat' },
      { key: 'stB', label: 'B', type: 'numeric', kind: 'stat' },
    ],
    rows: g.rows.map((r) => ({
      id: r.id,
      values: {
        'sample:name': r.id,
        'var:cond': r.cond,
        'var:dose': r.dose,
        'var:rep': r.rep,
        stA: r.A ?? Number.NaN,
        stB: r.B ?? Number.NaN,
      },
    })),
  };
  // null: not finite (NaN for log of a negative or a missing value; ±Inf).
  const close = (a: unknown, b: number | null, tol: { rel: number; abs: number }) =>
    typeof a === 'number' && (b === null ? !Number.isFinite(a) : isClose(a, b, tol));

  it('formula columns (log to any base, ln, log2, log10, exp, sqrt, abs, min, max, ^, precedence)', () => {
    const derived: DerivedColumn[] = g.formulas.map((f) => ({
      id: f.id,
      name: f.id,
      kind: 'formula',
      expr: f.expr,
    }));
    const { table: t, errors } = applyDerived(table, derived);
    expect(errors).toEqual({});
    const errs: string[] = [];
    for (const f of g.formulas)
      t.rows.forEach((r, i) => {
        const got = r.values[`derived:${f.id}`];
        if (!close(got, f.y[i]!, TOL.formula)) errs.push(`${f.expr} row ${r.id}: ${got} ≠ ${f.y[i]}`);
      });
    expect(errs).toEqual([]);
  });

  it('normalization to reference rows (ratio, percent, difference; overall and within dose)', () => {
    const derived: DerivedColumn[] = g.normalize.map((n) => ({
      id: n.id,
      name: n.id,
      kind: 'normalize',
      source: 'stA',
      refVariable: 'cond',
      refValue: 'ctrl',
      within: n.within,
      mode: n.mode,
    }));
    const { table: t, errors } = applyDerived(table, derived);
    expect(errors).toEqual({});
    const errs: string[] = [];
    for (const n of g.normalize)
      t.rows.forEach((r, i) => {
        const got = r.values[`derived:${n.id}`];
        if (!close(got, n.y[i]!, TOL.stats)) errs.push(`${n.id} row ${r.id}: ${got} ≠ ${n.y[i]}`);
      });
    expect(errs).toEqual([]);
  });

  it('replicates combined by condition and dose (pandas groupby, SciPy t for the 95% CI)', () => {
    const funcs: AggFunc[] = ['n', 'mean', 'sd', 'sem', 'ci95', 'median', 'cv', 'min', 'max'];
    const t = aggregate(table, ['var:cond', 'var:dose'], funcs);
    expect(t.rows.map((r) => [r.values['var:cond'], r.values['var:dose']])).toEqual(
      g.groups.map((x) => [x.cond, x.dose]),
    );
    const errs: string[] = [];
    g.groups.forEach((want, i) => {
      const v = t.rows[i]!.values;
      const at = `${want.cond} ${want.dose}`;
      if (v['group:n'] !== want.rows) errs.push(`${at} n: ${v['group:n']} ≠ ${want.rows}`);
      for (const [col, s] of [
        ['stA', want.A],
        ['stB', want.B],
      ] as const)
        for (const f of funcs.filter((x) => x !== 'n')) {
          const tol = f === 'ci95' ? TOL.tdist : TOL.stats;
          if (!close(v[`${col}#${f}`], s[f], tol))
            errs.push(`${at} ${col} ${f}: ${v[`${col}#${f}`]} ≠ ${s[f]}`);
        }
      const pd: [string, number | null][] = [
        ['stA#mean', want.pandas.A_mean!],
        ['stA#sd', want.pandas.A_std!],
        ['stA#sem', want.pandas.A_sem!],
        ['stA#median', want.pandas.A_median!],
        ['stB#mean', want.pandas.B_mean!],
        ['stB#sd', want.pandas.B_std!],
      ];
      for (const [k, b] of pd)
        if (!close(v[k], b, TOL.stats)) errs.push(`${at} ${k} vs pandas: ${v[k]} ≠ ${b}`);
    });
    expect(errs).toEqual([]);
  });
});
