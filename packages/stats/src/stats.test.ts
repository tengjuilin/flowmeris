import { linearize, parseFcs } from '@flowmeris/fcs';
import { TOL, isClose, readFixture, readGolden } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { frequencies, medianSorted, percentileSorted, summarize } from './index.ts';

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
