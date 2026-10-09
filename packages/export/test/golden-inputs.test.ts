/**
 * Golden inputs: files the app writes (Gating-ML, gated-event FCS) that FlowKit then evaluates
 * (tools/golden/python/generate.py). With GOLDEN_WRITE=1 (`corepack pnpm golden:inputs`) they are
 * written to fixtures/golden/inputs; otherwise the app's current output must equal the committed
 * files byte for byte, so the FlowKit results in fixtures/golden still describe what the app exports.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fixturePath, hasFixture } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { eventsToFcs } from '../src/index.ts';
import { engineFor, gatingML, inputPath, manifest, provenance, scenarios } from './golden-scenario.ts';

const WRITE = process.env.GOLDEN_WRITE === '1';

function check(rel: string, bytes: Uint8Array) {
  const path = fixturePath(rel);
  if (WRITE) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return;
  }
  expect(hasFixture(rel), `${rel} is missing: run corepack pnpm golden`).toBe(true);
  const committed = new Uint8Array(readFileSync(path));
  // Compare as text where possible, for a readable diff.
  if (rel.endsWith('.xml') || rel.endsWith('.json'))
    expect(new TextDecoder().decode(bytes), `${rel} changed: run corepack pnpm golden`).toBe(
      new TextDecoder().decode(committed),
    );
  else
    expect(
      Buffer.from(bytes).equals(Buffer.from(committed)),
      `${rel} changed: run corepack pnpm golden`,
    ).toBe(true);
}

const enc = (s: string) => new TextEncoder().encode(s);

describe('golden inputs: the app still writes the files FlowKit evaluated', () => {
  for (const sc of scenarios()) {
    it(`${sc.name}: Gating-ML and manifest`, () => {
      check(inputPath.gml(sc), enc(gatingML(sc)));
      check(inputPath.manifest(sc), enc(`${JSON.stringify(manifest(sc), null, 1)}\n`));
    });
    for (const e of sc.fcsExports)
      it(`${sc.name}: ${e.pop} events (${e.mode}) as FCS`, async () => {
        const { engine, ctx } = engineFor(sc);
        const ev = await engine.populationEvents(ctx, sc.sampleId, e.pop, e.mode);
        check(inputPath.fcs(sc, e), eventsToFcs(sc.data.keywords, ev, e.mode, provenance(sc, e)));
      });
  }
});
