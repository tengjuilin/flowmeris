import { type BundledFamily, type FaceName, GENERIC_FAMILY, type Generic, bundledFamily } from './catalog.ts';

/** Which font a figure's text is drawn in, read from its (inlined) CSS: shared by the PDF and SVG exports. */

export interface TextFont {
  /** The font-family list, unquoted, in order. */
  families: string[];
  bold: boolean;
  italic: boolean;
}

const GENERICS = new Set<string>(['sans-serif', 'serif', 'monospace']);

export function isGeneric(family: string): family is Generic {
  return GENERICS.has(family.toLowerCase());
}

/** The families of a CSS font-family value, unquoted. */
export function parseFamilies(stack: string): string[] {
  return stack
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** The font of an element with `style` (bold from weight 600, as browsers pick a bold face). */
export function textFont(style: { fontFamily: string; fontWeight: string; fontStyle: string }): TextFont {
  const w = style.fontWeight;
  return {
    families: parseFamilies(style.fontFamily),
    bold: w === 'bold' || w === 'bolder' || Number(w) >= 600,
    italic: style.fontStyle === 'italic' || style.fontStyle.startsWith('oblique'),
  };
}

export function faceName(bold: boolean, italic: boolean): FaceName {
  return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
}

/** One step of a font-family list: a bundled family, or an installed font to look for. */
export type FontStep = { bundled: BundledFamily } | { installed: string };

/**
 * The fonts to try for a font-family list, in order: bundled families as they are, a generic family as its
 * bundled stand-in (GENERIC_FAMILY), any other name as an installed font. Ends at the first bundled one,
 * and always ends with one (the bundled sans-serif when the list names none).
 */
export function fontSteps(families: string[]): FontStep[] {
  const steps: FontStep[] = [];
  for (const f of families) {
    const b = bundledFamily(isGeneric(f) ? GENERIC_FAMILY[f.toLowerCase() as Generic] : f);
    if (b) return [...steps, { bundled: b }];
    steps.push({ installed: f });
  }
  return [...steps, { bundled: bundledFamily(GENERIC_FAMILY['sans-serif'])! }];
}
