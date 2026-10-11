/**
 * The figure fonts (ADR-0011). Every font a figure can use from the font menu is one of these bundled
 * families, drawn on screen from the same files that SVG, PNG, JPEG and PDF exports embed, so text looks
 * and measures the same everywhere. The files are fetched by tools/fetch-fonts.mjs (tools/fonts.lock.json);
 * lib/fonts/catalog.test.ts checks that this list and the lock file agree.
 *
 * To add a family: add its four files to tools/fonts.lock.json, its entry to BUNDLED and its menu entry
 * to FONT_GROUPS. A family must have all four faces: a PDF cannot synthesize bold or italic.
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
  { family: 'Inter', generic: 'sans-serif', files: faces('Inter', RBIB), license: 'Inter.LICENSE.txt' },
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
  /** The bundled family. */
  family: string;
  /** What it stands in for, shown after the family in the menu. */
  like?: string;
}

/** The font menu. */
export const FONT_GROUPS: { label: string; fonts: FontChoice[] }[] = [
  {
    label: 'Sans-serif',
    fonts: [
      { id: 'arial', family: 'Liberation Sans', like: 'Arial, Helvetica metrics' },
      { id: 'sans', family: 'Inter' },
      { id: 'calibri', family: 'Carlito', like: 'Calibri metrics' },
      { id: 'verdana', family: 'DejaVu Sans', like: 'like Verdana' },
      { id: 'trebuchet', family: 'Fira Sans' },
    ],
  },
  {
    label: 'Serif',
    fonts: [
      { id: 'times', family: 'Liberation Serif', like: 'Times New Roman metrics' },
      { id: 'serif', family: 'Gelasio', like: 'Georgia metrics' },
      { id: 'garamond', family: 'EB Garamond' },
    ],
  },
  {
    label: 'Monospace',
    fonts: [
      { id: 'mono', family: 'DejaVu Sans Mono', like: 'like Menlo' },
      { id: 'courier', family: 'Liberation Mono', like: 'Courier New metrics' },
    ],
  },
];

/** Font ids of earlier versions, which had no bundled font of their own: drawn as the id they map to. */
export const FONT_ALIASES: Record<string, string> = {
  helvetica: 'arial',
  tahoma: 'verdana',
  georgia: 'serif',
  palatino: 'garamond',
  consolas: 'mono',
};

const CHOICES = new Map(FONT_GROUPS.flatMap((g) => g.fonts.map((f) => [f.id, f])));
const FAMILIES = new Map(BUNDLED.map((f) => [f.family.toLowerCase(), f]));

/** The menu's id for a saved font id (resolving FONT_ALIASES), or undefined for an installed font's name. */
export function fontChoice(id: string): FontChoice | undefined {
  return CHOICES.get(FONT_ALIASES[id] ?? id);
}

/** The menu label of a font id, or the name of an installed font. */
export function fontLabel(id: string): string {
  const c = fontChoice(id);
  return c ? (c.like ? `${c.family} (${c.like})` : c.family) : id;
}

/** The bundled family named `family` (case-insensitive). */
export function bundledFamily(family: string): BundledFamily | undefined {
  return FAMILIES.get(family.toLowerCase());
}

/**
 * CSS font-family for a font id, or for the name of an installed font (which falls back to the bundled
 * sans-serif, as its PDF does where the font cannot be embedded).
 */
export function fontStack(id: string): string {
  const c = fontChoice(id);
  if (c) return `"${c.family}", ${bundledFamily(c.family)!.generic}`;
  return `"${id.replace(/["\;<>{}]/g, '')}", "${GENERIC_FAMILY['sans-serif']}", sans-serif`;
}
