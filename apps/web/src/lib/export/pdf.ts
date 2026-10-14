import {
  type FaceName,
  bundledBytes,
  faceName,
  fontSteps,
  installedTrueType,
  isGeneric,
  textFont,
  underlineMetrics,
} from '../fonts/index.ts';
import { MISSING_FONTS } from './fontFaces.ts';
import type { Warn } from './formats.ts';
import { StandardPdfFonts, ownText, standardFont, winAnsiText } from './pdfFonts.ts';
import { type Underline, bakeBaselines, drawUnderlines, splitHalos } from './pdfText.ts';
import { bytesToBase64 } from './standalone.ts';

/**
 * Vector PDF export of figures (method M-EXPORT-PLOT) with jsPDF and svg2pdf, loaded on demand. Text in
 * Arial, Helvetica, Times New Roman or Courier New names its font without embedding it (ADR-0013,
 * pdfFonts.ts). Any other text's font is embedded (ADR-0011, ADR-0012): the system font's face where the
 * browser can read it, else its bundled fallback, which the user is warned about.
 */

type Pdf = import('jspdf').jsPDF;

/** jsPDF's (and svg2pdf's) name for each face: a regular face is 'normal'. */
const JSPDF_STYLE: Record<FaceName, string> = {
  regular: 'normal',
  bold: 'bold',
  italic: 'italic',
  bolditalic: 'bolditalic',
};

/** Registers each face once per PDF, under the family and style names svg2pdf will look up. */
class PdfFonts {
  private done = new Map<string, boolean>();
  /** Underline metrics of each registered face. */
  readonly underline = new Map<string, Underline | undefined>();
  constructor(private pdf: Pdf) {}

  /** Embed `bytes` (when given) as `family` in `face`; false when they could not be had. */
  async add(family: string, face: FaceName, bytes: () => Promise<Uint8Array | undefined>) {
    const key = `${family}|${face}`;
    if (!this.done.has(key)) {
      const b = await bytes().catch(() => undefined);
      if (b) {
        const file = `${family}-${face}.ttf`;
        this.pdf.addFileToVFS(file, bytesToBase64(b));
        this.pdf.addFont(file, family, JSPDF_STYLE[face]);
        this.underline.set(key, underlineMetrics(b));
      }
      this.done.set(key, !!b);
    }
    return this.done.get(key)!;
  }

  /**
   * Embed the first of a text's fonts that can be had (see fontSteps): with the installed font it replaces
   * when that is a bundled fallback, and `missing` when a bundled font could not be had.
   */
  async embed(families: string[], face: FaceName, bold: boolean, italic: boolean): Promise<Chosen> {
    let wanted: string | undefined;
    let missing = false;
    for (const step of fontSteps(families)) {
      const bundled = 'bundled' in step;
      const family = bundled ? step.bundled.family : step.installed;
      const bytes = bundled
        ? () => bundledBytes(step.bundled, face)
        : () => installedTrueType(step.installed, bold, italic);
      if (await this.add(family, face, bytes)) {
        const underline = this.underline.get(`${family}|${face}`);
        return { family, underline, replaced: bundled ? wanted : undefined, missing };
      }
      if (bundled) missing = true;
      else wanted ??= family;
    }
    return { missing };
  }
}

/** The font a text is drawn in (none: a standard font for its generic family), and what it replaces. */
interface Chosen {
  family?: string;
  underline?: Underline;
  replaced?: string;
  missing?: boolean;
}

/** jsPDF's standard fonts for other text, used only when the bundled fonts are missing from the build. */
const STANDARD_PDF_FONT = { 'sans-serif': 'helvetica', serif: 'times', monospace: 'courier' } as const;

/**
 * Draw `t` in a standard font without embedding it (see pdfFonts.ts), its minus signs as en dashes, when
 * its font has one and the font can draw its text: the jsPDF family to draw it in, else undefined.
 */
async function drawStandard(t: SVGElement, families: string[], face: FaceName, fonts: StandardPdfFonts) {
  const font = standardFont(families);
  if (!font) return undefined;
  const nodes = ownText(t);
  const texts = nodes.map((n) => winAnsiText(n.data));
  if (texts.some((s) => s === undefined)) return undefined;
  const used = await fonts.add(font, face);
  if (used) for (const [i, n] of nodes.entries()) n.data = texts[i]!;
  return used;
}

/**
 * Point each text at a font of the PDF: a standard font where it can (drawStandard), else an embedded one
 * (see fontSteps). Returns the system fonts that had to be replaced, each with the bundled font used
 * instead, and whether the bundled fonts were missing.
 */
async function embedFonts(root: SVGSVGElement, pdf: Pdf) {
  const fonts = new PdfFonts(pdf);
  const standard = new StandardPdfFonts(pdf);
  const underlines = new Map<SVGElement, Underline | undefined>();
  const substituted = new Map<string, string>();
  let missing = false;
  for (const t of Array.from(root.querySelectorAll<SVGElement>('text, tspan'))) {
    if (!t.style.fontFamily) continue;
    const { families, bold, italic } = textFont(t.style);
    const face = faceName(bold, italic);
    const used: Chosen =
      (await drawStandard(t, families, face, standard)) ?? (await fonts.embed(families, face, bold, italic));
    if (used.family) underlines.set(t, used.underline);
    if (used.family && used.replaced) substituted.set(used.replaced, used.family);
    if (used.missing) missing = true;
    const generic = families.find(isGeneric)?.toLowerCase() as keyof typeof STANDARD_PDF_FONT | undefined;
    t.style.fontFamily = used.family ? `"${used.family}"` : STANDARD_PDF_FONT[generic ?? 'sans-serif'];
    // svg2pdf finds a face by weight 400 or 700 only.
    t.style.fontWeight = bold ? '700' : '400';
    t.style.fontStyle = italic ? 'italic' : 'normal';
  }
  return { substituted, missing, underlines };
}

/**
 * A one-page vector PDF of a laid-out standalone SVG (see mount.ts), which it changes: paths and text stay
 * vector, in standard or embedded fonts. `warn` is told which installed fonts had to be replaced.
 */
export async function svgToPdf(el: SVGSVGElement, warn?: Warn): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const w = Number(el.getAttribute('width'));
  const h = Number(el.getAttribute('height'));
  const pdf = new jsPDF({
    unit: 'px',
    format: [w, h],
    orientation: w >= h ? 'landscape' : 'portrait',
    hotfixes: ['px_scaling'],
    // Deflate every stream: svg2pdf adds the event raster uncompressed (8 MB for a 300 dpi plot) otherwise.
    compress: true,
  });
  bakeBaselines(el);
  splitHalos(el);
  const { substituted, missing, underlines } = await embedFonts(el, pdf);
  drawUnderlines(el, (t) => underlines.get(t));
  await svg2pdf(el, pdf, { x: 0, y: 0, width: w, height: h });
  if (substituted.size) {
    const list = [...substituted].map(([font, used]) => `${used} in place of ${font}`);
    warn?.(`The PDF uses ${list.join(', ')}.`);
  }
  if (missing) warn?.(MISSING_FONTS);
  return pdf.output('blob');
}
