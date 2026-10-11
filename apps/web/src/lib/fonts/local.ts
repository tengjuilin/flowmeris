import { fontFromCollection, sfntKind } from './sfnt.ts';

/**
 * Fonts installed on this computer, for a figure set in a font the app does not bundle ("Other installed
 * font…"). Only Chromium can read them (Local Font Access API), after the user allows it.
 */

interface LocalFont {
  family: string;
  style: string;
  postscriptName: string;
  blob(): Promise<Blob>;
}

let localFonts: Promise<LocalFont[]> | undefined;

/**
 * The installed fonts; empty when the browser cannot list them or the user declines. Call it while the
 * click that started an export still counts as a user gesture (the permission prompt needs one).
 */
export function installedFonts(): Promise<LocalFont[]> {
  const q = (globalThis as { queryLocalFonts?: () => Promise<LocalFont[]> }).queryLocalFonts;
  if (!q) return Promise.resolve([]);
  localFonts ??= q.call(globalThis).catch(() => {
    localFonts = undefined;
    return [];
  });
  return localFonts;
}

const isBold = (f: LocalFont) => /\bbold\b/i.test(f.style) && !/semi|demi|extra|ultra/i.test(f.style);
const isItalic = (f: LocalFont) => /italic|oblique/i.test(f.style);

/**
 * The installed face of `family` with this weight and slant as a TrueType file jsPDF can embed (taken
 * out of a collection if need be); undefined when there is none, or it has PostScript (CFF) outlines.
 */
export async function installedTrueType(family: string, bold: boolean, italic: boolean) {
  const want = family.toLowerCase();
  const face = (await installedFonts()).find(
    (f) => f.family.toLowerCase() === want && isBold(f) === bold && isItalic(f) === italic,
  );
  if (!face) return undefined;
  const bytes = new Uint8Array(await (await face.blob()).arrayBuffer());
  const kind = sfntKind(bytes);
  if (kind === 'truetype') return bytes;
  if (kind !== 'collection') return undefined;
  const one = fontFromCollection(bytes, face.postscriptName);
  return one && sfntKind(one) === 'truetype' ? one : undefined;
}
