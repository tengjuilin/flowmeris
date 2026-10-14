// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { BUNDLED, FACES } from '../fonts/catalog.ts';
import {
  StandardPdfFonts,
  fitsStandard,
  needsInstalledFonts,
  ownText,
  standardFont,
  winAnsiText,
} from './pdfFonts.ts';

// Not new URL(…, import.meta.url), which Vite rewrites to a served path under jsdom.
const dir = `${dirname(fileURLToPath(import.meta.url))}/../../assets/fonts/`;
const fetched = BUNDLED.every((f) => FACES.every((face) => existsSync(dir + f.files[face])));

// The bundled files, read from disk (in the app they are fetched from its server).
vi.mock('../fonts/files.ts', () => ({
  bundledBytes: async (family: { files: Record<string, string> }, face: string) =>
    new Uint8Array(readFileSync(dir + family.files[face])),
}));

function figure(body: string): SVGSVGElement {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  return document.querySelector('svg')!;
}

describe('standard PDF fonts', () => {
  it('are those of Arial, Helvetica, Times New Roman, Times, Courier New and Courier, first in the list', () => {
    expect(standardFont(['Arial', 'Liberation Sans', 'sans-serif'])?.names.regular).toBe('ArialMT');
    expect(standardFont(['arial'])?.names.bolditalic).toBe('Arial-BoldItalicMT');
    expect(standardFont(['Helvetica', 'Helvetica Neue'])?.names.italic).toBe('Helvetica-Oblique');
    expect(standardFont(['Times New Roman', 'Times'])?.names.bold).toBe('TimesNewRomanPS-BoldMT');
    expect(standardFont(['Courier New'])?.base).toBe('courier');
    // Fonts without one are embedded, also when a standard font comes later in the list.
    expect(standardFont(['Verdana', 'DejaVu Sans', 'sans-serif'])).toBeUndefined();
    expect(standardFont(['Liberation Sans', 'Arial'])).toBeUndefined();
    expect(standardFont(['sans-serif'])).toBeUndefined();
    expect(standardFont([])).toBeUndefined();
  });

  it('draw WinAnsiEncoding text, with minus signs as en dashes', () => {
    expect(winAnsiText('−10³')).toBe('–10³');
    expect(winAnsiText('CD4+ CD8−')).toBe('CD4+ CD8–');
    expect(winAnsiText('µm × 10² ± 5 € – “ok”\n')).toBe('µm × 10² ± 5 € – “ok”\n');
    expect(winAnsiText('')).toBe('');
    // Greek, superscripts beyond ³, C1 controls: not in WinAnsiEncoding.
    expect(winAnsiText('α')).toBeUndefined();
    expect(winAnsiText('10⁵')).toBeUndefined();
    expect(winAnsiText('\u0081')).toBeUndefined();
  });

  it('check only a text’s own characters, not those of its tspans', () => {
    const svg = figure('<text>−10<tspan>α</tspan></text>');
    const text = svg.querySelector('text')!;
    expect(ownText(text).map((n) => n.data)).toEqual(['−10']);
    expect(fitsStandard(text)).toBe(true);
    expect(fitsStandard(svg.querySelector('tspan')!)).toBe(false);
  });

  it('let a PDF skip asking for installed fonts unless one may be embedded', () => {
    const stack = (family: string, text = 'CD4') => `<text style='font-family:${family}'>${text}</text>`;
    expect(needsInstalledFonts(figure(stack('Arial, "Liberation Sans", sans-serif')))).toBe(false);
    expect(needsInstalledFonts(figure(stack('"Liberation Sans", sans-serif')))).toBe(false);
    expect(needsInstalledFonts(figure(stack('"Times New Roman", Times', '−1')))).toBe(false);
    // Text a standard font cannot draw, a font without one, a font only the computer has.
    expect(needsInstalledFonts(figure(stack('Arial, "Liberation Sans"', 'α')))).toBe(true);
    expect(needsInstalledFonts(figure(stack('Verdana, "DejaVu Sans"')))).toBe(true);
    expect(needsInstalledFonts(figure(stack('Futura')))).toBe(true);
  });
});

// The fonts written to a PDF, once tools/fetch-fonts.mjs has run (CI fetches them).
describe.skipIf(!fetched)('a PDF in standard fonts', () => {
  const { jsPDF } = createRequire(import.meta.url)('jspdf') as typeof import('jspdf');

  async function pdfOf(family: string, face: 'regular' | 'bold' | 'italic' | 'bolditalic', text: string) {
    const pdf = new jsPDF({ unit: 'px', format: [200, 100], hotfixes: ['px_scaling'] });
    const fonts = new StandardPdfFonts(pdf);
    const used = (await fonts.add(standardFont([family])!, face))!;
    pdf.setFont(
      used.family,
      { regular: 'normal', bold: 'bold', italic: 'italic', bolditalic: 'bolditalic' }[face],
    );
    pdf.setFontSize(10);
    pdf.text(text, 10, 50);
    return { pdf, used, out: pdf.output() };
  }

  /** The PDF object that names `name` as its BaseFont, and its descriptor. */
  function fontObjects(out: string, name: string) {
    const font =
      out.match(new RegExp(`<<\\n/Type /Font\\n[^>]*/BaseFont /${name}\\n[\\s\\S]*?>>`))?.[0] ?? '';
    const ref = font.match(/\/FontDescriptor (\d+) 0 R/)?.[1];
    const descriptor = out.match(new RegExp(`\\n${ref} 0 obj\\n<<[\\s\\S]*?>>`))?.[0] ?? '';
    return { font, descriptor };
  }

  it('name Arial with its widths and descriptor, without embedding it', async () => {
    const { out, used } = await pdfOf('Arial', 'regular', '–10 CD4');
    const { font, descriptor } = fontObjects(out, 'ArialMT');
    expect(font).toContain('/Subtype /TrueType');
    expect(font).toContain('/Encoding /WinAnsiEncoding');
    // Space, "!", '"', "#": Arial's widths, which Liberation Sans shares.
    expect(font).toMatch(/\/FirstChar 32\n\/LastChar 255\n\/Widths \[278 278 355 556 /);
    // The descriptor, read from Liberation Sans, lets a reader without Arial choose a stand-in.
    expect(descriptor).toContain('/FontName /ArialMT');
    expect(descriptor).toContain('/Flags 32');
    expect(descriptor).toContain('/ItalicAngle 0');
    expect(descriptor).toContain('/Ascent 905');
    expect(descriptor).toContain('/Descent -212');
    expect(descriptor).toMatch(/\/CapHeight \d+/);
    expect(out).not.toMatch(/\/FontFile/);
    expect(out.length).toBeLessThan(10_000);
    // Arial's underline, not Liberation Sans's.
    expect(used.underline!.offset).toBeCloseTo(217 / 2048, 9);
  });

  it('name each face by its PostScript name', async () => {
    const italic = (await pdfOf('Times New Roman', 'bolditalic', 'x')).out;
    const { descriptor } = fontObjects(italic, 'TimesNewRomanPS-BoldItalicMT');
    expect(descriptor).toContain('/Flags 98');
    expect(descriptor).toMatch(/\/ItalicAngle -1\d\.\d+/);
    const helvetica = (await pdfOf('Helvetica', 'bold', 'x')).out;
    expect(fontObjects(helvetica, 'Helvetica-Bold').font).toContain('/Subtype /Type1');
    const courier = (await pdfOf('Courier New', 'regular', 'x')).out;
    expect(fontObjects(courier, 'CourierNewPSMT').font).toMatch(/\/Widths \[600 600 600 /);
  });

  it('measure text with the font’s exact widths, without kerning, as the browser lays it out', async () => {
    const { pdf } = await pdfOf('Arial', 'regular', 'x');
    // "1" is 556/1000 em in Arial (jsPDF's own Helvetica metrics say 550); "AV" would kern.
    const em = pdf.getFontSize() / pdf.internal.scaleFactor;
    expect(pdf.getTextWidth('1') / em).toBeCloseTo(0.556, 9);
    expect(pdf.getTextWidth('AV') / em).toBeCloseTo(0.667 * 2, 9);
    expect(pdf.getTextWidth('–') / em).toBeCloseTo(0.556, 9);
  });

  it('name a jsPDF font once: after Arial, Helvetica text is drawn in Arial (same widths)', async () => {
    const pdf = new jsPDF({ unit: 'px', hotfixes: ['px_scaling'] });
    const fonts = new StandardPdfFonts(pdf);
    await fonts.add(standardFont(['Arial'])!, 'regular');
    await fonts.add(standardFont(['Helvetica'])!, 'regular');
    pdf.setFont('helvetica', 'normal');
    pdf.text('x', 10, 10);
    const out = pdf.output();
    expect(out).toContain('/BaseFont /ArialMT');
    expect(out).not.toContain('/BaseFont /Helvetica\n');
  });
});
