import {
  type FaceMetrics,
  type FaceName,
  bundledBytes,
  bundledFamily,
  faceMetrics,
  fontSteps,
  parseFamilies,
} from '../fonts/index.ts';
import type { Underline } from './pdfText.ts';

/**
 * Fonts a PDF names without embedding them (method M-EXPORT-PLOT, ADR-0013): Arial, Helvetica, Times New
 * Roman, Times, Courier New and Courier, which are on practically every computer or stood in for by every
 * PDF reader. Their text is drawn with one of jsPDF's standard fonts, so it is encoded in WinAnsiEncoding
 * (Windows-1252), and the PDF carries each face's name, character widths and descriptor, read from the
 * bundled family with the same widths (Liberation), but not its glyphs.
 */

type Pdf = import('jspdf').jsPDF;
type PdfFont = import('jspdf').Font;

/** jsPDF's standard font whose encoding a font's text uses. */
type Base = 'helvetica' | 'times' | 'courier';

interface StandardFont {
  base: Base;
  /** The family name a viewer looks a stand-in up by, written as the descriptor's FontFamily. */
  family: string;
  /** The PostScript name of each face: the PDF's BaseFont, which readers look up. */
  names: Record<FaceName, string>;
  /** The bundled family with the same character widths, read for the PDF's Widths and descriptor. */
  metrics: string;
  /** PDF font type: Type1 for the standard 14 fonts, TrueType for the others. */
  subtype: 'Type1' | 'TrueType';
  /** Font descriptor flags of the upright faces: 1 fixed pitch, 2 serif, 32 nonsymbolic. */
  flags: number;
  /**
   * The font's own underline (its 'post' table, or for the standard 14 fonts their AFM files), of its
   * regular and italic faces and of its bold faces: Liberation's differs.
   */
  underline: [Underline, Underline];
}

/** An underline `offset` below the baseline and `thickness` thick, in units of 1/`em` em. */
const ul = (offset: number, thickness: number, em: number): Underline => ({
  offset: offset / em,
  thickness: thickness / em,
});
const AFM_UNDERLINE: [Underline, Underline] = [ul(100, 50, 1000), ul(100, 50, 1000)];

const names = (regular: string, bold: string, italic: string, bolditalic: string) => ({
  regular,
  bold,
  italic,
  bolditalic,
});

/** By font family, lowercase. */
const STANDARD: Record<string, StandardFont> = {
  arial: {
    family: 'Arial',
    base: 'helvetica',
    names: names('ArialMT', 'Arial-BoldMT', 'Arial-ItalicMT', 'Arial-BoldItalicMT'),
    metrics: 'Liberation Sans',
    subtype: 'TrueType',
    flags: 32,
    underline: [ul(217, 150, 2048), ul(217, 215, 2048)],
  },
  helvetica: {
    family: 'Helvetica',
    base: 'helvetica',
    names: names('Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'),
    metrics: 'Liberation Sans',
    subtype: 'Type1',
    flags: 32,
    underline: AFM_UNDERLINE,
  },
  'times new roman': {
    family: 'Times New Roman',
    base: 'times',
    names: names(
      'TimesNewRomanPSMT',
      'TimesNewRomanPS-BoldMT',
      'TimesNewRomanPS-ItalicMT',
      'TimesNewRomanPS-BoldItalicMT',
    ),
    metrics: 'Liberation Serif',
    subtype: 'TrueType',
    flags: 34,
    underline: [ul(223, 100, 2048), ul(223, 195, 2048)],
  },
  times: {
    family: 'Times',
    base: 'times',
    names: names('Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'),
    metrics: 'Liberation Serif',
    subtype: 'Type1',
    flags: 34,
    underline: AFM_UNDERLINE,
  },
  'courier new': {
    family: 'Courier New',
    base: 'courier',
    names: names(
      'CourierNewPSMT',
      'CourierNewPS-BoldMT',
      'CourierNewPS-ItalicMT',
      'CourierNewPS-BoldItalicMT',
    ),
    metrics: 'Liberation Mono',
    subtype: 'TrueType',
    flags: 35,
    underline: [ul(477, 84, 2048), ul(477, 205, 2048)],
  },
  courier: {
    family: 'Courier',
    base: 'courier',
    names: names('Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'),
    metrics: 'Liberation Mono',
    subtype: 'Type1',
    flags: 35,
    underline: AFM_UNDERLINE,
  },
};

/** The standard font of a font-family list: its first family's, if it has one. */
export function standardFont(families: string[]): StandardFont | undefined {
  return STANDARD[families[0]?.toLowerCase() ?? ''];
}

/** WinAnsiEncoding (Windows-1252) codes 128–159, which differ from Latin-1: 0 where it has no character. */
const WIN_ANSI_80 = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0,
  0x017d, 0, 0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0, 0x017e, 0x0178,
];

/** The Unicode code point of each WinAnsiEncoding code from 32 to 255 (0 where it has no character). */
const WIN_ANSI = Array.from({ length: 224 }, (_, i) => {
  const code = i + 32;
  if (code >= 128 && code < 160) return WIN_ANSI_80[code - 128]!;
  return code === 127 ? 0 : code;
});
const ENCODABLE = new Set([...WIN_ANSI.filter(Boolean).map((c) => String.fromCharCode(c)), '\t', '\n', '\r']);

/**
 * `text` as a standard font can draw it: with the minus sign (U+2212) as an en dash (U+2013), which
 * WinAnsiEncoding has; undefined when another character is not in WinAnsiEncoding.
 */
export function winAnsiText(text: string): string | undefined {
  const s = text.replaceAll('−', '–');
  for (const c of s) if (!ENCODABLE.has(c)) return undefined;
  return s;
}

/** The text nodes of an SVG text or tspan, not those of its child tspans. */
export function ownText(t: Element): Text[] {
  return Array.from(t.childNodes).filter((n): n is Text => n.nodeType === Node.TEXT_NODE);
}

/** A standard font can draw all of `t`'s own text (after winAnsiText). */
export function fitsStandard(t: Element): boolean {
  return ownText(t).every((n) => winAnsiText(n.data) !== undefined);
}

/**
 * Whether a PDF of the on-screen figure `svg` would look for fonts installed on the computer: some text
 * is neither in a standard font (which it fits) nor in a bundled one.
 */
export function needsInstalledFonts(svg: SVGSVGElement): boolean {
  return Array.from(svg.querySelectorAll('text, tspan')).some((t) => {
    const families = parseFamilies(getComputedStyle(t).fontFamily);
    if (standardFont(families) && fitsStandard(t)) return false;
    return 'installed' in fontSteps(families)[0]!;
  });
}

const JSPDF_STYLE: Record<FaceName, string> = {
  regular: 'normal',
  bold: 'bold',
  italic: 'italic',
  bolditalic: 'bolditalic',
};

interface Named {
  font: StandardFont;
  face: FaceName;
  metrics: FaceMetrics;
}

/**
 * The standard fonts of one PDF. `add` names a face of jsPDF's standard font after a system font and
 * gives it that font's widths, which the PDF then carries in place of jsPDF's own (rounded to 10/1000 em,
 * with kerning, which figure text does not use). One jsPDF font is named once: a figure that uses both
 * Arial and Helvetica (same widths) names both after the first it uses.
 */
export class StandardPdfFonts {
  private named = new Map<string, Promise<{ family: Base; underline?: Underline } | undefined>>();
  private byId = new Map<string, Named>();

  constructor(private pdf: Pdf) {
    pdf.internal.events.subscribe('putFont', (args: PutFont) => this.put(args));
  }

  /** The jsPDF family to draw `face` of `font` with; undefined when its widths cannot be read. */
  add(font: StandardFont, face: FaceName) {
    const key = `${font.base}|${face}`;
    let p = this.named.get(key);
    if (!p) {
      p = this.name(font, face);
      this.named.set(key, p);
    }
    return p;
  }

  private async name(font: StandardFont, face: FaceName) {
    const bytes = await bundledBytes(bundledFamily(font.metrics)!, face).catch(() => undefined);
    if (!bytes) return undefined;
    const metrics = faceMetrics(bytes, WIN_ANSI);
    const f = (this.pdf as unknown as { getFont(family: string, style: string): PdfFont }).getFont(
      font.base,
      JSPDF_STYLE[face],
    );
    const widths: Record<string, number> = { fof: 1000 };
    WIN_ANSI.forEach((c, i) => {
      if (c) widths[c] = metrics.widths[i]!;
    });
    f.metadata.Unicode = { ...f.metadata.Unicode, widths, kerning: {} };
    this.byId.set(String(f.id), { font, face, metrics });
    return { family: font.base, underline: font.underline[face.startsWith('bold') ? 1 : 0] };
  }

  /** Write a named face as a font without a font program: name, encoding, widths and descriptor. */
  private put({ font, out, newObject }: PutFont) {
    const n = this.byId.get(String(font.id));
    if (!n) return;
    const { metrics: m, face } = n;
    const name = n.font.names[face];
    const descriptor = newObject();
    out('<<');
    out('/Type /FontDescriptor');
    out(`/FontName /${name}`);
    out(`/FontFamily (${n.font.family})`);
    out('/FontStretch /Normal');
    out(`/FontWeight ${face.startsWith('bold') ? 700 : 400}`);
    out(`/Flags ${n.font.flags | (face.endsWith('italic') ? 64 : 0)}`);
    out(`/FontBBox [${m.bbox.join(' ')}]`);
    out(`/ItalicAngle ${m.italicAngle}`);
    out(`/Ascent ${m.ascent}`);
    out(`/Descent ${m.descent}`);
    out(`/CapHeight ${m.capHeight}`);
    out(`/StemV ${face.startsWith('bold') ? 140 : 80}`);
    out('>>');
    out('endobj');
    font.objectNumber = newObject();
    out('<<');
    out('/Type /Font');
    out(`/Subtype /${n.font.subtype}`);
    out(`/BaseFont /${name}`);
    out('/Encoding /WinAnsiEncoding');
    out('/FirstChar 32');
    out('/LastChar 255');
    out(`/Widths [${m.widths.join(' ')}]`);
    out(`/FontDescriptor ${descriptor} 0 R`);
    out('>>');
    out('endobj');
    font.isAlreadyPutted = true;
  }
}

/** What jsPDF passes its putFont event. */
interface PutFont {
  font: PdfFont & { isAlreadyPutted?: boolean };
  out: (s: string) => void;
  newObject: () => number;
}
