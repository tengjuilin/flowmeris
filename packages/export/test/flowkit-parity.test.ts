/**
 * Gating-ML exported by the app, evaluated by FlowKit (fixtures/golden/gml_flowkit), against the
 * engine: every population's membership must be identical, event by event. And gated events exported
 * as FCS, read back by FlowKit (fixtures/golden/fcs_export), must be the engine's events exactly
 * (as float32, the file's $DATATYPE).
 */
import { createHash } from 'node:crypto';
import { getBit, popcount } from '@flowmeris/gating';
import type { StatSpec } from '@flowmeris/model';
import { TOL, hasFixture, isClose, readGolden } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { engineFor, inputPath, provenance, scenarios } from './golden-scenario.ts';

interface GmlGolden {
  event_count: number;
  populations: Record<
    string,
    {
      parent: string;
      count: number;
      parent_count: number;
      relative_percent: number;
      absolute_percent: number;
      /** Base64, event i = bit i % 8 of byte i / 8. */
      members: string;
    }
  >;
}

interface FcsExportGolden {
  path: string;
  pop: string;
  mode: 'raw' | 'compensated';
  version: string;
  event_count: number;
  flowkit_count: number;
  pnn: string[];
  keywords: Record<string, string>;
  spillover_keywords: string[];
  flowmeris: Record<string, string>;
  events_sha256: string;
  col_sum: number[];
}

const unpack = (b64: string, n: number): Uint8Array => {
  const bytes = Buffer.from(b64, 'base64');
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bytes[i >> 3]! >> (i & 7)) & 1;
  return out;
};

for (const sc of scenarios()) {
  const rel = `gml_flowkit/${sc.name}.json`;
  describe.skipIf(!hasFixture(`golden/${rel}`))(`Gating-ML export evaluated by FlowKit: ${sc.name}`, () => {
    const g = readGolden<GmlGolden>(rel);
    const { engine, ctx } = engineFor(sc);

    it('covers every population of the scenario', () => {
      const ours = Object.keys(sc.group.template.populations).filter((p) => p !== 'root');
      expect(Object.keys(g.populations).sort()).toEqual(ours.sort());
      expect(g.event_count).toBe(sc.ds.eventCount);
    });

    for (const [popId, want] of Object.entries(g.populations))
      it(`${popId}: identical membership, count and percentages`, async () => {
        const bits = engine.popBits(ctx, sc.data, popId);
        const fk = unpack(want.members, g.event_count);
        const bad: number[] = [];
        for (let e = 0; e < g.event_count; e++) if ((getBit(bits, e) ? 1 : 0) !== fk[e]) bad.push(e);
        expect(bad.slice(0, 10), `${bad.length} events differ`).toEqual([]);
        expect(popcount(bits)).toBe(want.count);

        const [c] = await engine.counts(ctx, sc.sampleId, [popId]);
        expect(c!.count).toBe(want.count);
        expect(c!.parentCount).toBe(want.parent_count);
        const spec = (stat: StatSpec['stat']): StatSpec => ({
          id: stat,
          population: popId,
          stat,
          space: 'linear',
        });
        const [pp, pt] = await engine.stats(ctx, sc.sampleId, [spec('pctParent'), spec('pctTotal')]);
        // FlowKit reports 0% for an empty parent; Flowmeris leaves it undefined (NaN).
        if (want.parent_count > 0) expect(isClose(pp!.value, want.relative_percent, TOL.stats)).toBe(true);
        expect(isClose(pt!.value, want.absolute_percent, TOL.stats)).toBe(true);
      });
  });

  for (const e of sc.fcsExports) {
    const name = inputPath
      .fcs(sc, e)
      .split('/')
      .pop()!
      .replace(/\.fcs$/, '');
    const rel = `fcs_export/${name}.json`;
    describe.skipIf(!hasFixture(`golden/${rel}`))(`gated events as FCS, read by FlowKit: ${name}`, () => {
      const g = readGolden<FcsExportGolden>(rel);
      it('holds the engine’s events exactly, with the expected keywords', async () => {
        const { engine, ctx } = engineFor(sc);
        const ev = await engine.populationEvents(ctx, sc.sampleId, e.pop, e.mode);
        expect(g.version).toBe('3.1');
        expect(g.event_count).toBe(ev.count);
        expect(g.flowkit_count).toBe(ev.count);
        expect(g.pnn).toEqual(ev.channels);
        expect(g.keywords).toMatchObject({
          datatype: 'F',
          byteord: '1,2,3,4',
          mode: 'L',
          tot: String(ev.count),
        });
        expect(Number(g.keywords.par)).toBe(ev.channels.length);
        // A compensated file must not carry the spillover matrix (it would be applied twice).
        if (e.mode === 'compensated') expect(g.spillover_keywords).toEqual([]);
        const prov = Object.fromEntries(
          Object.entries(provenance(sc, e)).map(([k, v]) => [k.toLowerCase(), v]),
        );
        expect(g.flowmeris).toEqual(prov);

        // Row-major float32 values, widened to float64, as FlowKit returns them.
        const rows = new Float64Array(ev.count * ev.channels.length);
        for (let i = 0; i < ev.count; i++)
          for (let j = 0; j < ev.channels.length; j++)
            rows[i * ev.channels.length + j] = Math.fround(ev.columns[j]![i]!);
        const sha = createHash('sha256').update(Buffer.from(rows.buffer)).digest('hex');
        if (sha !== g.events_sha256) {
          // Point at the channels that differ.
          const sums = ev.columns.map((c) => c.reduce((s, v) => s + Math.fround(v), 0));
          expect(sums).toEqual(g.col_sum);
        }
        expect(sha).toBe(g.events_sha256);
      });
    });
  }
}
