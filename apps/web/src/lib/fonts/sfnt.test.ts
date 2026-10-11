import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { BUNDLED, FACES } from './catalog.ts';
import { fontFromCollection, postscriptName, sfntKind } from './sfnt.ts';

/** A minimal sfnt: a 'name' table with PostScript name `ps`, and a 'data' table of `body`. */
function sfnt(ps: string, body: number[]): Uint8Array {
  const str = [...ps].flatMap((c) => [0, c.charCodeAt(0)]);
  const name = [0, 0, 0, 1, 0, 18, 0, 3, 0, 1, 4, 9, 0, 6, 0, str.length, 0, 0, ...str];
  const tabs: [string, number[]][] = [
    ['data', body],
    ['name', name],
  ];
  const pad = (n: number) => (n + 3) & ~3;
  const out = new Uint8Array(12 + tabs.length * 16 + tabs.reduce((s, [, t]) => s + pad(t.length), 0));
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, tabs.length);
  let off = 12 + tabs.length * 16;
  tabs.forEach(([tag, t], i) => {
    for (let k = 0; k < 4; k++) out[12 + i * 16 + k] = tag.charCodeAt(k);
    v.setUint32(12 + i * 16 + 8, off);
    v.setUint32(12 + i * 16 + 12, t.length);
    out.set(t, off);
    off += pad(t.length);
  });
  return out;
}

/** A collection of `fonts`, with table offsets rebased to the collection. */
function ttc(fonts: Uint8Array[]): Uint8Array {
  const head = 12 + fonts.length * 4;
  const out = new Uint8Array(head + fonts.reduce((s, f) => s + f.length, 0));
  const v = new DataView(out.buffer);
  out.set([116, 116, 99, 102]);
  v.setUint32(4, 0x00010000);
  v.setUint32(8, fonts.length);
  let at = head;
  fonts.forEach((f, i) => {
    v.setUint32(12 + i * 4, at);
    out.set(f, at);
    const n = new DataView(f.buffer).getUint16(4);
    for (let t = 0; t < n; t++) v.setUint32(at + 12 + t * 16 + 8, v.getUint32(at + 12 + t * 16 + 8) + at);
    at += f.length;
  });
  return out;
}

describe('sfnt', () => {
  it('tells TrueType from CFF and collections', () => {
    expect(sfntKind(sfnt('A', [1]))).toBe('truetype');
    expect(sfntKind(new Uint8Array([79, 84, 84, 79]))).toBe('cff');
    expect(sfntKind(ttc([sfnt('A', [1])]))).toBe('collection');
    expect(sfntKind(new Uint8Array(4))).toBe('unknown');
  });

  it('takes one font out of a collection by its PostScript name', () => {
    const a = sfnt('Helvetica', [1, 2, 3]);
    const b = sfnt('Helvetica-Bold', [9, 8, 7, 6, 5]);
    const coll = ttc([a, b]);
    expect(postscriptName(coll, 12 + 8)).toBe('Helvetica');
    const one = fontFromCollection(coll, 'Helvetica-Bold')!;
    expect(sfntKind(one)).toBe('truetype');
    expect(postscriptName(one)).toBe('Helvetica-Bold');
    expect(one).toEqual(b);
    expect(fontFromCollection(coll, 'Helvetica-Light')).toBeUndefined();
  });
});

const dir = new URL('../../assets/fonts/', import.meta.url).pathname;
const fetched = BUNDLED.every((f) => FACES.every((face) => existsSync(dir + f.files[face])));

// The bundled files themselves, once tools/fetch-fonts.mjs has run (CI fetches them).
describe.skipIf(!fetched)('bundled font files', () => {
  const { jsPDF } = createRequire(import.meta.url)('jspdf') as typeof import('jspdf');

  it('are TrueType faces that jsPDF embeds, each face distinct', () => {
    for (const f of BUNDLED) {
      const widths = FACES.map((face) => {
        const bytes = readFileSync(dir + f.files[face]);
        expect(sfntKind(bytes), f.files[face]).toBe('truetype');
        const pdf = new jsPDF({ unit: 'px', hotfixes: ['px_scaling'] });
        pdf.addFileToVFS(f.files[face], bytes.toString('base64'));
        pdf.addFont(f.files[face], f.family, face);
        pdf.setFont(f.family, face);
        pdf.text('CD4 10⁵ µm − ±', 10, 10);
        expect(pdf.output(), f.files[face]).toContain('/FontFile2');
        return pdf.getTextWidth('Wide bold italic text');
      });
      if (f.generic !== 'monospace') expect(new Set(widths).size, f.family).toBeGreaterThan(1);
    }
  });
});
