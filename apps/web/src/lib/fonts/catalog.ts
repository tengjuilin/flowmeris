/**
 * The figure fonts (ADR-0011, ADR-0012). The font menu lists system fonts by name (FONT_MENU). Each has a
 * bundled open font with its proportions (BUNDLED), which draws it where it is not installed, and which
 * an export embeds where it cannot embed the system font (a PDF made outside Chromium), so a figure keeps
 * its layout everywhere. The bundled files are fetched by tools/fetch-fonts.mjs (tools/fonts.lock.json);
 * lib/fonts/catalog.test.ts checks that this list and the lock file agree.
 *
 * To add a menu font: add its FONTS entry (with a bundled fallback) and its id to FONT_MENU. To add a
 * fallback family: add its four files to tools/fonts.lock.json and its entry to BUNDLED. A bundled family
 * must have all four faces: a PDF cannot synthesize bold or italic.
 */

export type Generic = 'sans-serif' | 'serif' | 'monospace';
export type FaceName = 'regular' | 'bold' | 'italic' | 'bolditalic';
export const FACES: FaceName[] = ['regular', 'bold', 'italic', 'bolditalic'];

export interface BundledFamily {
  /** CSS font-family name, also the name the PDF registers. */
  family: string;
  generic: Generic;
  /** File of each face, in apps/web/src/assets/fonts. */
  files: Record<FaceName, string>;
  /** Its license file, fetched with it. */
  license: string;
}

const faces = (prefix: string, [regular, bold, italic, bolditalic]: string[]) => ({
  regular: `${prefix}${regular}.ttf`,
  bold: `${prefix}${bold}.ttf`,
  italic: `${prefix}${italic}.ttf`,
  bolditalic: `${prefix}${bolditalic}.ttf`,
});
const RBIB = ['-Regular', '-Bold', '-Italic', '-BoldItalic'];
const DEJAVU = ['', '-Bold', '-Oblique', '-BoldOblique'];

export const BUNDLED: BundledFamily[] = [
  {
    family: 'Liberation Sans',
    generic: 'sans-serif',
    files: faces('LiberationSans', RBIB),
    license: 'Liberation.LICENSE.txt',
  },
  {
    family: 'Liberation Serif',
    generic: 'serif',
    files: faces('LiberationSerif', RBIB),
    license: 'Liberation.LICENSE.txt',
  },
  {
    family: 'Liberation Mono',
    generic: 'monospace',
    files: faces('LiberationMono', RBIB),
    license: 'Liberation.LICENSE.txt',
  },
  { family: 'Carlito', generic: 'sans-serif', files: faces('Carlito', RBIB), license: 'Carlito.LICENSE.txt' },
  {
    family: 'DejaVu Sans',
    generic: 'sans-serif',
    files: faces('DejaVuSans', DEJAVU),
    license: 'DejaVu.LICENSE.txt',
  },
  {
    family: 'Fira Sans',
    generic: 'sans-serif',
    files: faces('FiraSans', RBIB),
    license: 'FiraSans.LICENSE.txt',
  },
  { family: 'Gelasio', generic: 'serif', files: faces('Gelasio', RBIB), license: 'Gelasio.LICENSE.txt' },
  {
    family: 'EB Garamond',
    generic: 'serif',
    files: faces('EBGaramond', RBIB),
    license: 'EBGaramond.LICENSE.txt',
  },
  {
    family: 'DejaVu Sans Mono',
    generic: 'monospace',
    files: faces('DejaVuSansMono', DEJAVU),
    license: 'DejaVu.LICENSE.txt',
  },
];

/** The bundled family drawn for a generic family, and after a font that is not available. */
export const GENERIC_FAMILY: Record<Generic, string> = {
  'sans-serif': 'Liberation Sans',
  serif: 'Liberation Serif',
  monospace: 'Liberation Mono',
};

export interface FontChoice {
  /** Saved in the workspace (`fontFamily`). */
  id: string;
  /** The menu's name for it. */
  label: string;
  /** The system font's family names, in the order the browser tries them. */
  families: string[];
  /** The bundled family drawn and embedded in its place where it is missing (see BUNDLED). */
  fallback: string;
}

const font = (id: string, label: string, families: string[], fallback: string): FontChoice => ({
  id,
  label,
  families,
  fallback,
});

/** Every font id a figure can be saved with. */
export const FONTS: FontChoice[] = [
  font('arial', 'Arial', ['Arial'], 'Liberation Sans'),
  font('helvetica', 'Helvetica', ['Helvetica', 'Helvetica Neue'], 'Liberation Sans'),
  font('times', 'Times New Roman', ['Times New Roman', 'Times'], 'Liberation Serif'),
  font('trebuchet', 'Trebuchet MS', ['Trebuchet MS'], 'Fira Sans'),
  font('verdana', 'Verdana', ['Verdana'], 'DejaVu Sans'),
  font('consolas', 'Consolas', ['Consolas'], 'DejaVu Sans Mono'),
  // Not in the menu: kept for figures saved with them, and listed while a figure uses one.
  font('calibri', 'Calibri', ['Calibri'], 'Carlito'),
  font('tahoma', 'Tahoma', ['Tahoma'], 'DejaVu Sans'),
  font('georgia', 'Georgia', ['Georgia'], 'Gelasio'),
  font('serif', 'Serif', ['Georgia', 'Times New Roman'], 'Gelasio'),
  font('palatino', 'Palatino', ['Palatino Linotype', 'Palatino', 'Book Antiqua'], 'EB Garamond'),
  font('garamond', 'Garamond', ['Garamond'], 'EB Garamond'),
  font('courier', 'Courier New', ['Courier New', 'Courier'], 'Liberation Mono'),
  font('mono', 'Monospace', ['Menlo', 'Consolas'], 'DejaVu Sans Mono'),
];

/** The font menu, in order (ids of FONTS). */
export const FONT_MENU = ['arial', 'helvetica', 'times', 'trebuchet', 'verdana', 'consolas'];

/** Saved font ids drawn as another: 'sans' was the charts' default. */
export const FONT_ALIASES: Record<string, string> = { sans: 'arial' };

const CHOICES = new Map(FONTS.map((f) => [f.id, f]));
const FAMILIES = new Map(BUNDLED.map((f) => [f.family.toLowerCase(), f]));

/** The font of a saved font id (resolving FONT_ALIASES), or undefined for an installed font's name. */
export function fontChoice(id: string): FontChoice | undefined {
  return CHOICES.get(FONT_ALIASES[id] ?? id);
}

/** The menu label of a font id, or the name of an installed font. */
export function fontLabel(id: string): string {
  return fontChoice(id)?.label ?? id;
}

/** The bundled family named `family` (case-insensitive). */
export function bundledFamily(family: string): BundledFamily | undefined {
  return FAMILIES.get(family.toLowerCase());
}

const quote = (f: string) => `"${f.replace(/["\\;<>{}]/g, '')}"`;

/**
 * CSS font-family for a font id, or for the name of an installed font: the system font, then the bundled
 * font drawn in its place (the bundled sans-serif after an installed font's name).
 */
export function fontStack(id: string): string {
  const c = fontChoice(id);
  const fallback = bundledFamily(c?.fallback ?? GENERIC_FAMILY['sans-serif'])!;
  return [...(c ? c.families : [id]).map(quote), quote(fallback.family), fallback.generic].join(', ');
}
