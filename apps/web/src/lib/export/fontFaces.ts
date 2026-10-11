import {
  type BundledFamily,
  type FaceName,
  bundledBytes,
  faceName,
  fontSteps,
  textFont,
} from '../fonts/index.ts';
import type { Warn } from './formats.ts';
import { SVG_NS, bytesToBase64 } from './standalone.ts';

/**
 * Embedding the bundled fonts in SVG files and in the SVG that PNG and JPEG are drawn from (ADR-0011): an
 * SVG drawn as an image cannot use the page's fonts, and an SVG file should look the same anywhere.
 */

export const MISSING_FONTS =
  'The figure fonts are missing from this build, so the export uses other fonts (run corepack pnpm fonts:fetch).';

/** The bundled faces a figure's text is drawn in: for each text, its first bundled family (see fontSteps). */
export function usedFaces(svg: SVGSVGElement): { family: BundledFamily; face: FaceName }[] {
  const used = new Map<string, { family: BundledFamily; face: FaceName }>();
  for (const t of Array.from(svg.querySelectorAll<SVGElement>('text, tspan'))) {
    if (!t.style.fontFamily) continue;
    const { families, bold, italic } = textFont(t.style);
    const face = faceName(bold, italic);
    for (const step of fontSteps(families)) {
      if ('bundled' in step) used.set(`${step.bundled.family}|${face}`, { family: step.bundled, face });
    }
  }
  return [...used.values()];
}

/** Add `@font-face` rules with the used bundled faces as data URLs to `svg`'s first child, a <style>. */
export async function embedFontFaces(svg: SVGSVGElement, warn?: Warn) {
  let missing = false;
  const rules = await Promise.all(
    usedFaces(svg).map(async ({ family, face }) => {
      const bytes = await bundledBytes(family, face).catch(() => undefined);
      if (!bytes) {
        missing = true;
        return '';
      }
      const weight = face.startsWith('bold') ? 700 : 400;
      const style = face.endsWith('italic') ? 'italic' : 'normal';
      const src = `url(data:font/ttf;base64,${bytesToBase64(bytes)}) format("truetype")`;
      return `@font-face{font-family:"${family.family}";font-weight:${weight};font-style:${style};src:${src}}`;
    }),
  );
  if (missing) warn?.(MISSING_FONTS);
  const css = rules.filter(Boolean).join('\n');
  if (!css) return;
  const el = document.createElementNS(SVG_NS, 'style');
  el.textContent = css;
  svg.insertBefore(el, svg.firstChild);
}
