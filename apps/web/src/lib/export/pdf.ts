import { bytesToBase64 } from './standalone.ts';

/** Vector PDF export of on-screen SVG figures (jsPDF + svg2pdf, loaded on demand), embedding installed fonts. */

interface LocalFont {
  family: string;
  style: string;
  blob(): Promise<Blob>;
}

let localFonts: Promise<LocalFont[]> | undefined;

/** Fonts installed on this computer (Chromium's Local Font Access API); empty when unavailable or denied. */
function installedFonts(): Promise<LocalFont[]> {
  const q = (window as unknown as { queryLocalFonts?: () => Promise<LocalFont[]> }).queryLocalFonts;
  if (!q) return Promise.resolve([]);
  localFonts ??= q.call(window).catch(() => {
    localFonts = undefined;
    return [];
  });
  return localFonts;
}

const STANDARD_PDF_FONT = { 'sans-serif': 'helvetica', serif: 'times', monospace: 'courier' } as const;

function genericOf(families: string[]): keyof typeof STANDARD_PDF_FONT {
  for (let i = families.length - 1; i >= 0; i--) {
    const f = families[i]!.toLowerCase();
    if (f in STANDARD_PDF_FONT) return f as keyof typeof STANDARD_PDF_FONT;
  }
  return 'sans-serif';
}

function fontStyleName(bold: boolean, italic: boolean) {
  return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
}

/** The installed face of `family` with the requested weight and slant, as TrueType bytes jsPDF can embed. */
async function findTrueType(all: LocalFont[], family: string, bold: boolean, italic: boolean) {
  const want = family.toLowerCase();
  const faces = all.filter((f) => f.family.toLowerCase() === want);
  const isBold = (f: LocalFont) => /\bbold\b/i.test(f.style) && !/semi|demi|extra|ultra/i.test(f.style);
  const isItalic = (f: LocalFont) => /italic|oblique/i.test(f.style);
  const face = faces.find((f) => isBold(f) === bold && isItalic(f) === italic);
  if (!face) return undefined;
  const bytes = new Uint8Array(await (await face.blob()).arrayBuffer());
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  // jsPDF embeds TrueType outlines only (not CFF "OTTO" or collections "ttcf").
  if (tag !== '\0\x01\0\0' && tag !== 'true') return undefined;
  return bytes;
}

/**
 * Point each <text> at a font the PDF actually has: the installed face the figure's font stack resolves to
 * (embedded), else the standard PDF font of the same kind. Returns the families that had to be substituted.
 */
async function embedFonts(root: SVGSVGElement, pdf: import('jspdf').jsPDF): Promise<string[]> {
  const all = await installedFonts();
  const registered = new Set<string>();
  const substituted = new Set<string>();
  for (const t of Array.from(root.querySelectorAll('text, tspan'))) {
    const st = (t as SVGElement).style;
    const families = st.fontFamily
      .split(',')
      .map((f) => f.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    if (!families.length) continue;
    const bold = Number(st.fontWeight) >= 600 || st.fontWeight === 'bold';
    const italic = st.fontStyle === 'italic' || st.fontStyle === 'oblique';
    const style = fontStyleName(bold, italic);
    let chosen: string | undefined;
    for (const fam of families) {
      if (fam.toLowerCase() in STANDARD_PDF_FONT) break;
      const key = `${fam}|${style}`;
      if (registered.has(key)) {
        chosen = fam;
        break;
      }
      const bytes = await findTrueType(all, fam, bold, italic);
      if (!bytes) continue;
      const file = `${fam}-${style}.ttf`;
      pdf.addFileToVFS(file, bytesToBase64(bytes));
      pdf.addFont(file, fam, style);
      registered.add(key);
      chosen = fam;
      break;
    }
    if (chosen) st.fontFamily = `"${chosen}"`;
    else {
      st.fontFamily = STANDARD_PDF_FONT[genericOf(families)];
      substituted.add(families[0]!);
    }
  }
  return [...substituted];
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
 * vector, with fonts embedded where possible. `warn` is told which fonts had to be replaced by a standard
 * PDF font.
 */
export async function svgToPdf(el: SVGSVGElement, warn?: (message: string) => void): Promise<Blob> {
  // Ask for installed fonts first, while the click that started the export still counts as a user gesture.
  const fonts = installedFonts();
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js'), fonts]);
  const w = Number(el.getAttribute('width'));
  const h = Number(el.getAttribute('height'));
  const pdf = new jsPDF({
    unit: 'px',
    format: [w, h],
    orientation: w >= h ? 'landscape' : 'portrait',
    hotfixes: ['px_scaling'],
  });
  splitHalos(el);
  const substituted = await embedFonts(el, pdf);
  await svg2pdf(el, pdf, { x: 0, y: 0, width: w, height: h });
  if (substituted.length)
    warn?.(
      `PDF used a standard font in place of ${substituted.join(', ')} (not embeddable from this browser).`,
    );
  return pdf.output('blob');
}
