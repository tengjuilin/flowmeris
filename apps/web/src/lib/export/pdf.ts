import {
  type FaceName,
  GENERIC_FAMILY,
  bundledBytes,
  faceName,
  fontSteps,
  installedTrueType,
  isGeneric,
  textFont,
} from '../fonts/index.ts';
import { MISSING_FONTS } from './fontFaces.ts';
import type { Warn } from './formats.ts';
import { bytesToBase64 } from './standalone.ts';

/**
 * Vector PDF export of figures (method M-EXPORT-PLOT) with jsPDF and svg2pdf, loaded on demand. Every
 * text's font is embedded (ADR-0011): the bundled face it is drawn in on screen, or for an installed font
 * the installed face where the browser can read it, else the bundled face that stands in for it.
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
      }
      this.done.set(key, !!b);
    }
    return this.done.get(key)!;
  }
}

/** jsPDF's standard fonts, used only when the bundled fonts are missing from the build. */
const STANDARD_PDF_FONT = { 'sans-serif': 'helvetica', serif: 'times', monospace: 'courier' } as const;

/**
 * Point each text at a font embedded in the PDF (see fontSteps). Returns the installed fonts that had to
 * be replaced, and whether the bundled fonts were missing.
 */
async function embedFonts(root: SVGSVGElement, pdf: Pdf) {
  const fonts = new PdfFonts(pdf);
  const substituted = new Set<string>();
  let missing = false;
  for (const t of Array.from(root.querySelectorAll<SVGElement>('text, tspan'))) {
    if (!t.style.fontFamily) continue;
    const { families, bold, italic } = textFont(t.style);
    const face = faceName(bold, italic);
    let chosen: string | undefined;
    for (const step of fontSteps(families)) {
      const ok =
        'bundled' in step
          ? await fonts.add(step.bundled.family, face, () => bundledBytes(step.bundled, face))
          : await fonts.add(step.installed, face, () => installedTrueType(step.installed, bold, italic));
      if (ok) {
        chosen = 'bundled' in step ? step.bundled.family : step.installed;
        break;
      }
      if ('installed' in step) substituted.add(step.installed);
      else missing = true;
    }
    const generic = families.find(isGeneric)?.toLowerCase() as keyof typeof STANDARD_PDF_FONT | undefined;
    t.style.fontFamily = chosen ? `"${chosen}"` : STANDARD_PDF_FONT[generic ?? 'sans-serif'];
    // svg2pdf finds a face by weight 400 or 700 only.
    t.style.fontWeight = bold ? '700' : '400';
    t.style.fontStyle = italic ? 'italic' : 'normal';
  }
  return { substituted: [...substituted], missing };
}

/**
 * svg2pdf ignores `paint-order`, so a text's halo stroke would be painted over its glyphs. Draw the halo
 * as a separate copy behind the text instead, and the text itself without a stroke.
 */
function splitHalos(root: SVGSVGElement) {
  for (const t of Array.from(root.querySelectorAll<SVGTextElement>('text'))) {
    if (!t.style.paintOrder.startsWith('stroke') || !t.style.stroke || t.style.stroke === 'none') continue;
    const halo = t.cloneNode(true) as SVGTextElement;
    halo.style.fill = 'none';
    t.parentNode!.insertBefore(halo, t);
    t.style.stroke = 'none';
  }
}

/**
 * A one-page vector PDF of a laid-out standalone SVG (see mount.ts), which it changes: paths and text stay
 * vector, with every font embedded. `warn` is told which installed fonts had to be replaced.
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
  });
  splitHalos(el);
  const { substituted, missing } = await embedFonts(el, pdf);
  await svg2pdf(el, pdf, { x: 0, y: 0, width: w, height: h });
  if (substituted.length)
    warn?.(
      `The PDF uses ${GENERIC_FAMILY['sans-serif']} in place of ${substituted.join(', ')}: this browser cannot embed installed fonts (Chromium-based browsers can, once allowed).`,
    );
  if (missing) warn?.(MISSING_FONTS);
  return pdf.output('blob');
}
