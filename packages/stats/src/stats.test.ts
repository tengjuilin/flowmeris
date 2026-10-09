import { linearize, parseFcs } from '@flowmeris/fcs';
import { TOL, isClose, readFixture, readGolden } from '@flowmeris/testkit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type ValueStat,
  ci95HalfWidth,
  frequencies,
  mean,
  medianSorted,
  percentileSorted,
  sd,
  sem,
  summarize,
  tCdf,
  tQuantile,
} from './index.ts';

interface StatGolden {
  channel: string;
  n: number;
  mean: number;
  sd: number;
  median: number;
  min: number;
  max: number;
  percentiles: Record<string, number>;
  geom_mean_pos: number | null;
  n_nonpos: number;
}

describe('golden parity: statistics vs NumPy on data1.fcs', () => {
  const golden = readGolden<StatGolden[]>('stats_data1.json');
  const ds = parseFcs(readFixture('flowkit/gate_ref/data1.fcs')).datasets[0]!;
  for (const g of golden) {
    it(g.channel, () => {
      const i = ds.channels.findIndex((c) => c.pnn === g.channel);
      const x = linearize(ds.columns[i]!, ds.channels[i]!.scaling);
      const ps = Object.keys(g.percentiles);
      const r = summarize(x, [
        { stat: 'mean' },
        { stat: 'sd' },
        { stat: 'median' },
        { stat: 'min' },
        { stat: 'max' },
        { stat: 'geomMean' },
        ...ps.map((p) => ({ stat: 'percentile' as const, p: Number(p) })),
      ]);
      const errs: string[] = [];
      const cmp = (label: string, a: number, b: number | null) => {
        if (!isClose(a, b, TOL.stats)) errs.push(`${label}: ${a} ≠ ${b}`);
      };
      cmp('mean', r[0]!.value, g.mean);
      cmp('sd', r[1]!.value, g.sd);
      cmp('median', r[2]!.value, g.median);
      cmp('min', r[3]!.value, g.min);
      cmp('max', r[4]!.value, g.max);
      if (g.geom_mean_pos !== null) cmp('geomMean', r[5]!.value, g.geom_mean_pos);
      expect(r[5]!.nExcluded).toBe(g.n_nonpos);
      // Percentiles match NumPy exactly on linear channels (same order statistics and
      // lerp). Log-amplified channels are linearised with pow(), where V8 and the C
      // libm used by NumPy can differ by 1 ULP, so those get the stats tolerance.
      const logChannel = ds.channels[i]!.scaling.logDecades > 0;
      ps.forEach((p, k) => {
        const a = r[6 + k]!.value;
        const b = g.percentiles[p]!;
        if (logChannel ? !isClose(a, b, TOL.stats) : a !== b) errs.push(`P${p}: ${a} ≠ ${b}`);
      });
      expect(errs).toEqual([]);
    });
  }
});

describe('M-STAT definitions', () => {
  it('percentile type 7 on small arrays', () => {
    const s = [1, 2, 3, 4];
    expect(percentileSorted(s, 0)).toBe(1);
    expect(percentileSorted(s, 100)).toBe(4);
    expect(percentileSorted(s, 50)).toBe(2.5);
    expect(percentileSorted(s, 25)).toBe(1.75);
    expect(medianSorted([1, 2, 3])).toBe(2);
  });
  it('robust SD of a normal sample approximates its SD', () => {
    const n = 200001;
    const xs = new Float64Array(n);
    // deterministic normal quantiles
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      // Acklam-free: use inverse via Box–Muller-free approximation by bisection on erf
      xs[i] = Math.SQRT2 * erfinv(2 * u - 1);
    }
    const [rsd, rcv] = summarize(
      xs.map((v) => v * 10 + 100),
      [{ stat: 'rsd' }, { stat: 'rcv' }],
    );
    expect(rsd!.value).toBeCloseTo(10, 2);
    expect(rcv!.value).toBeCloseTo(10, 2);
  });
  it('excludes NaN and non-positive values where documented', () => {
    const [m, g] = summarize([1, Number.NaN, 4, -2], [{ stat: 'mean' }, { stat: 'geomMean' }]);
    expect(m).toEqual({ value: 1, n: 3, nExcluded: 1 });
    expect(g!.value).toBeCloseTo(2, 14);
    expect(g!.nExcluded).toBe(2);
  });
  it('order statistics by selection equal those of a full sort', () => {
    const reqs = [
      { stat: 'median' as const },
      { stat: 'min' as const },
      { stat: 'max' as const },
      { stat: 'rsd' as const },
      { stat: 'rcv' as const },
      { stat: 'percentile' as const, p: 0 },
      { stat: 'percentile' as const, p: 2.5 },
      { stat: 'percentile' as const, p: 99.9 },
      { stat: 'percentile' as const, p: 100 },
    ];
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.double({ noNaN: true, min: -1e6, max: 1e6 }), fc.integer({ min: -3, max: 3 })), {
          maxLength: 300,
        }),
        (xs) => {
          const sorted = Float64Array.from(xs).sort();
          const want = (stat: string, p?: number): number => {
            const n = sorted.length;
            if (n === 0) return Number.NaN;
            const rsd = (percentileSorted(sorted, 84.13) - percentileSorted(sorted, 15.87)) / 2;
            if (stat === 'median') return medianSorted(sorted);
            if (stat === 'min') return sorted[0]!;
            if (stat === 'max') return sorted[n - 1]!;
            if (stat === 'rsd') return rsd;
            if (stat === 'rcv') return (100 * rsd) / medianSorted(sorted);
            return percentileSorted(sorted, p!);
          };
          const got = summarize(xs, reqs);
          reqs.forEach((r, i) => expect(got[i]!.value + 0).toBe(want(r.stat, r.p) + 0));
          // Many ranks: the full-sort path.
          const ps = Array.from({ length: 40 }, (_, k) => k * 2.5);
          const many = summarize(
            Float64Array.from(xs),
            ps.map((p) => ({ stat: 'percentile' as const, p })),
            true,
          );
          ps.forEach((p, i) => expect(many[i]!.value + 0).toBe(want('percentile', p) + 0));
        },
      ),
    );
  });
  it('selection matches a full sort on large inputs (random, ties, presorted)', () => {
    let seed = 7;
    const rand = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 2 ** 32;
    };
    const inputs = [
      Float64Array.from({ length: 200_001 }, () => rand() * 1e4 - 5e3),
      Float64Array.from({ length: 200_000 }, (_, i) => (i * 7919) % 13),
      Float64Array.from({ length: 100_000 }, (_, i) => i),
      Float64Array.from({ length: 100_000 }, (_, i) => -i),
    ];
    const ps = [0, 0.1, 15.87, 50, 84.13, 99.9, 100];
    for (const xs of inputs) {
      const sorted = Float64Array.from(xs).sort();
      const got = summarize(xs, [
        { stat: 'median' },
        { stat: 'rcv' },
        ...ps.map((p) => ({ stat: 'percentile' as const, p })),
      ]);
      expect(got[0]!.value).toBe(medianSorted(sorted));
      const rsd = (percentileSorted(sorted, 84.13) - percentileSorted(sorted, 15.87)) / 2;
      expect(got[1]!.value).toBe((100 * rsd) / medianSorted(sorted));
      ps.forEach((p, i) => expect(got[i + 2]!.value).toBe(percentileSorted(sorted, p)));
    }
  });
  it('frequencies', () => {
    expect(frequencies(25, 50, 100, 200)).toEqual({
      count: 25,
      pctParent: 50,
      pctGrandparent: 25,
      pctTotal: 12.5,
    });
  });
});

function erfinv(x: number): number {
  // Newton iterations on erf from a Giles (2010) single-precision starting point.
  let w = -Math.log((1 - x) * (1 + x));
  let p: number;
  if (w < 5) {
    w -= 2.5;
    p = 2.81022636e-8;
    for (const c of [
      3.43273939e-7, -3.5233877e-6, -4.39150654e-6, 0.00021858087, -0.00125372503, -0.00417768164,
      0.246640727, 1.50140941,
    ])
      p = c + p * w;
  } else {
    w = Math.sqrt(w) - 3;
    p = -0.000200214257;
    for (const c of [
      0.000100950558, 0.00134934322, -0.00367342844, 0.00573950773, -0.0076224613, 0.00943887047, 1.00167406,
      2.83297682,
    ])
      p = c + p * w;
  }
  let y = p * x;
  for (let i = 0; i < 3; i++) {
    const err = erf(y) - x;
    y -= err / ((2 / Math.sqrt(Math.PI)) * Math.exp(-y * y));
  }
  return y;
}

function erf(x: number): number {
  // Abramowitz–Stegun 7.1.26 is too coarse; use series/continued fraction via high-precision approximation.
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y =
    1 -
    t *
      Math.exp(
        -x * x -
          1.26551223 +
          t *
            (1.00002368 +
              t *
                (0.37409196 +
                  t *
                    (0.09678418 +
                      t *
                        (-0.18628806 +
                          t *
                            (0.27886807 +
                              t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
      );
  return x >= 0 ? y : -y;
}

describe('replicate summaries', () => {
  it('t quantiles match published tables', async () => {
    const { tQuantile } = await import('./index.ts');
    // scipy.stats.t.ppf(0.975, df)
    const table: [number, number][] = [
      [1, 12.706204736174698],
      [2, 4.302652729749464],
      [3, 3.182446305284263],
      [5, 2.5705818356363146],
      [10, 2.2281388519862744],
      [30, 2.0422724563012373],
      [1000, 1.9623390808264078],
    ];
    for (const [df, q] of table) expect(tQuantile(0.975, df)).toBeCloseTo(q, 9);
    expect(tQuantile(0.025, 4)).toBeCloseTo(-2.7764451051977987, 9);
  });

  it('SEM and 95% CI half-width', async () => {
    const { sem, ci95HalfWidth } = await import('./index.ts');
    const x = [1, 2, 3, 4];
    // sd = 1.2909944487358056
    expect(sem(x)).toBeCloseTo(1.2909944487358056 / 2, 12);
    expect(ci95HalfWidth(x)).toBeCloseTo(3.182446305284263 * (1.2909944487358056 / 2), 9);
    expect(ci95HalfWidth([1])).toBeNaN();
  });
});

/** Golden value: null stands for a value that is not finite (JSON has no NaN or ±Inf). */
function closeOrNonFinite(
  a: number,
  b: number | null | undefined,
  tol: { rel: number; abs: number },
): boolean {
  return b === null || b === undefined ? !Number.isFinite(a) : isClose(a, b, tol);
}

interface EdgeCase {
  name: string;
  x: (number | null)[];
  n: number;
  n_excluded: number;
  mean?: number | null;
  sd?: number | null;
  cv?: number | null;
  median?: number | null;
  rsd?: number | null;
  rcv?: number | null;
  geom_mean?: number | null;
  geom_n?: number;
  min?: number | null;
  max?: number | null;
  percentiles?: Record<string, number>;
}

describe('golden parity: statistics vs NumPy on edge cases', () => {
  const g = readGolden<{ percentiles: number[]; cases: EdgeCase[] }>('stats_edge.json');
  const stats: [ValueStat, keyof EdgeCase][] = [
    ['mean', 'mean'],
    ['sd', 'sd'],
    ['cv', 'cv'],
    ['median', 'median'],
    ['rsd', 'rsd'],
    ['rcv', 'rcv'],
    ['geomMean', 'geom_mean'],
    ['min', 'min'],
    ['max', 'max'],
  ];
  for (const c of g.cases) {
    it(c.name, () => {
      const x = c.x.map((v) => (v === null ? Number.NaN : v));
      const r = summarize(x, [
        ...stats.map(([stat]) => ({ stat })),
        ...g.percentiles.map((p) => ({ stat: 'percentile' as const, p })),
      ]);
      const errs: string[] = [];
      stats.forEach(([stat, key], i) => {
        const got = r[i]!;
        const want = c[key] as number | null | undefined;
        if (!closeOrNonFinite(got.value, want, TOL.stats)) errs.push(`${stat}: ${got.value} ≠ ${want}`);
        const n = stat === 'geomMean' ? (c.geom_n ?? 0) : c.n;
        if (got.n !== n || got.nExcluded !== x.length - n)
          errs.push(`${stat}: n ${got.n}/${got.nExcluded} ≠ ${n}/${x.length - n}`);
      });
      g.percentiles.forEach((p, k) => {
        const got = r[stats.length + k]!.value;
        const want = c.percentiles?.[String(p)];
        // Same order statistics and interpolation as NumPy: exact.
        if (want === undefined ? !Number.isNaN(got) : got !== want) errs.push(`P${p}: ${got} ≠ ${want}`);
      });
      expect(errs).toEqual([]);
    });
  }
});

interface SummaryGolden {
  x: (number | string)[];
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

describe('golden parity: replicate summaries and the t distribution vs SciPy', () => {
  const g = readGolden<{
    cases: SummaryGolden[];
    t_quantile: { p: number; df: number; q: number }[];
    t_cdf: { t: number; df: number; cdf: number }[];
  }>('aggregate.json');

  it('t quantiles (scipy.stats.t.ppf)', () => {
    const errs = g.t_quantile
      .filter(({ p, df, q }) => !isClose(tQuantile(p, df), q, TOL.tdist))
      .map(({ p, df, q }) => `t(${p}, ${df}): ${tQuantile(p, df)} ≠ ${q}`);
    expect(errs).toEqual([]);
  });

  it('t cumulative distribution (scipy.stats.t.cdf)', () => {
    const errs = g.t_cdf
      .filter(({ t, df, cdf }) => !isClose(tCdf(t, df), cdf, TOL.tdist))
      .map(({ t, df, cdf }) => `F(${t}; ${df}): ${tCdf(t, df)} ≠ ${cdf}`);
    expect(errs).toEqual([]);
  });

  it('mean, SD, SEM and 95% CI half-width of finite values', () => {
    const errs: string[] = [];
    for (const c of g.cases) {
      const xs = c.x.filter((v): v is number => typeof v === 'number');
      const got = { mean: mean(xs), sd: sd(xs), sem: sem(xs), ci95: ci95HalfWidth(xs) };
      for (const [k, v] of Object.entries(got)) {
        const want = c[k as keyof typeof got];
        const tol = k === 'ci95' ? TOL.tdist : TOL.stats;
        if (!closeOrNonFinite(v, want, tol)) errs.push(`n=${c.n} ${k}: ${v} ≠ ${want}`);
      }
    }
    expect(errs).toEqual([]);
  });
});
