import { readFileSync, readdirSync } from 'node:fs';
import { linearize, parseFcs } from '@flowmeris/fcs';
import { fixturePath, readFixture } from '@flowmeris/testkit';
import { describe, expect, it } from 'vitest';
import { type GmlSample, evaluateGatingML, parseGatingML } from './index.ts';

/**
 * Gating-ML 2.0 compliance suite (ISAC; Spidlen et al. 2015), run against
 * data1.fcs. Truth files list one 0/1 membership value per event.
 */

const ds = parseFcs(readFixture('flowkit/gate_ref/data1.fcs')).datasets[0]!;
const sample: GmlSample = {
  channels: ds.channels.map((c) => c.pnn),
  columns: ds.channels.map((c, i) => linearize(ds.columns[i]!, c.scaling)),
  keywords: ds.keywords,
  eventCount: ds.eventCount,
};

const truthDir = fixturePath('flowkit/gate_ref/truth');
const truths = readdirSync(truthDir)
  .filter((f) => f.startsWith('Results_'))
  .map((f) => ({
    id: f.replace(/^Results_/, '').replace(/\.txt$/, ''),
    values: readFileSync(`${truthDir}/${f}`, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '')
      .map((l) => (Number(l.trim()) ? 1 : 0)),
  }));

function mismatches(actual: Uint8Array, expected: number[]): number {
  let bad = 0;
  for (let e = 0; e < expected.length; e++) if ((actual[e] ? 1 : 0) !== expected[e]) bad++;
  return bad + Math.abs(actual.length - expected.length);
}

const gmlDir = fixturePath('flowkit/gate_ref/gml');
const gmlFiles = readdirSync(gmlDir).filter((f) => f.endsWith('.xml'));
/** gate id → (file → membership) over every compliance Gating-ML file. */
const produced = new Map<string, Map<string, Uint8Array>>();
for (const f of gmlFiles) {
  const doc = parseGatingML(readFileSync(`${gmlDir}/${f}`, 'utf8'));
  for (const [id, m] of evaluateGatingML(doc, sample)) {
    if (!produced.has(id)) produced.set(id, new Map());
    produced.get(id)!.set(f, m);
  }
}

/** Truth files whose name differs from the gate id (mapping as in FlowKit's gatingml_tests.py). */
const TRUTH_ALIASES: Record<string, string> = { ParQuadRect: 'ParRectangle1' };

describe('Gating-ML 2.0 compliance suite on data1.fcs (exact event-level agreement)', () => {
  for (const t of truths) {
    it(`${t.id}`, () => {
      expect(t.values.length).toBe(sample.eventCount);
      const byFile = produced.get(TRUTH_ALIASES[t.id] ?? t.id);
      expect(byFile, `no compliance file defines gate ${t.id}`).toBeDefined();
      for (const [file, m] of byFile!) expect(mismatches(m, t.values), `${t.id} in ${file}`).toBe(0);
    });
  }
  it('every compliance file parses and evaluates', () => {
    expect(gmlFiles.length).toBeGreaterThan(40);
  });
});
