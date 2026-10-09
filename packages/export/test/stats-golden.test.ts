/**
 * Population statistics from the engine against NumPy (fixtures/golden/stats_populations): every
 * population of the golden scenarios (membership from FlowKit), every channel, in linear
 * (compensated) units and in each transform's units, computed by FlowKit's transforms.
 */
import type { StatSpec } from '@flowmeris/model';
import { TOL, hasFixture, isClose, readGolden } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { engineFor, scenarios } from './golden-scenario.ts';

interface Values {
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

interface Golden {
  spaces: string[];
  percentiles: number[];
  populations: Record<string, Record<string, Record<string, Values>>>;
}

const STATS = ['mean', 'sd', 'cv', 'median', 'rsd', 'rcv', 'geomMean', 'min', 'max'] as const;
const KEY: Record<(typeof STATS)[number], keyof Values> = {
  mean: 'mean',
  sd: 'sd',
  cv: 'cv',
  median: 'median',
  rsd: 'rsd',
  rcv: 'rcv',
  geomMean: 'geom_mean',
  min: 'min',
  max: 'max',
};

for (const sc of scenarios()) {
  const rel = `stats_populations/${sc.name}.json`;
  describe.skipIf(!hasFixture(`golden/${rel}`))(`population statistics vs NumPy: ${sc.name}`, () => {
    const g = readGolden<Golden>(rel);
    const compensated = sc.group.compensation.mode !== 'none';
    for (const space of g.spaces) {
      // Transforms and compensation are matched to FlowKit within their own tolerances; statistics of
      // those values inherit them.
      const tol = space !== 'linear' ? TOL.transform : compensated ? TOL.compensation : TOL.stats;
      it(`${space === 'linear' ? 'linear' : sc.ws.transforms[space]!.kind} (${space})`, async () => {
        const { engine, ctx } = engineFor(sc);
        const specs: StatSpec[] = [];
        const want: { label: string; n: number; nExcluded: number; value: number | null }[] = [];
        for (const [pop, byChannel] of Object.entries(g.populations))
          for (const [channel, bySpace] of Object.entries(byChannel)) {
            const v = bySpace[space]!;
            const base = {
              population: pop,
              channel,
              space: space === 'linear' ? ('linear' as const) : ('transformed' as const),
              ...(space === 'linear' ? {} : { transform: space }),
            };
            const add = (
              stat: StatSpec['stat'],
              value: number | null | undefined,
              p?: number,
              geo = false,
            ) => {
              specs.push({ id: `${specs.length}`, stat, ...base, ...(p !== undefined ? { p } : {}) });
              want.push({
                label: `${pop} ${channel} ${stat}${p !== undefined ? ` P${p}` : ''}`,
                n: geo ? (v.geom_n ?? 0) : v.n,
                nExcluded: geo ? v.n + v.n_excluded - (v.geom_n ?? 0) : v.n_excluded,
                value: value ?? null,
              });
            };
            for (const s of STATS)
              add(s, v[KEY[s]] as number | null | undefined, undefined, s === 'geomMean');
            for (const p of g.percentiles) add('percentile', v.percentiles?.[String(p)], p);
          }
        const got = await engine.stats(ctx, sc.sampleId, specs);
        const errs: string[] = [];
        got.forEach((r, i) => {
          const w = want[i]!;
          if (r.n !== w.n || r.nExcluded !== w.nExcluded)
            errs.push(`${w.label}: n ${r.n}/${r.nExcluded} ≠ ${w.n}/${w.nExcluded}`);
          // null: not finite (JSON has no NaN or ±Inf). An empty population or the SD of one value is
          // undefined (NaN); the robust CV of a population whose median is 0 is infinite.
          if (w.value === null ? Number.isFinite(r.value) : !isClose(r.value, w.value, tol))
            errs.push(`${w.label}: ${r.value} ≠ ${w.value}`);
        });
        expect(errs.slice(0, 20), `${errs.length} of ${want.length} differ`).toEqual([]);
      });
    }
  });
}
