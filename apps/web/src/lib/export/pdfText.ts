import { SVG_NS } from './standalone.ts';

/**
 * Text features svg2pdf does not draw, rewritten into ones it does, on the laid-out standalone SVG before
 * it becomes a PDF (method M-EXPORT-PLOT). Each step measures the browser's own layout, which uses the same
 * font files as the PDF (ADR-0011), so the PDF puts text where the screen does.
 */

/** Underline position and thickness of a text's font, in em (see underlineMetrics). */
export type Underline = { offset: number; thickness: number };

const ALPHABETIC = new Set(['', 'auto', 'alphabetic', 'baseline']);

/**
 * svg2pdf ignores `dominant-baseline` (e.g. "middle", which centers tick and legend labels on their y).
 * Measure how far it moves each text in the browser and move the text by that much instead.
 */
export function bakeBaselines(root: SVGSVGElement) {
  for (const t of Array.from(root.querySelectorAll<SVGTextElement>('text'))) {
    const cs = getComputedStyle(t);
    const baseline = t.getAttribute('dominant-baseline') ?? cs.dominantBaseline;
    const align = t.getAttribute('alignment-baseline') ?? cs.alignmentBaseline;
    if (ALPHABETIC.has(baseline ?? '') && ALPHABETIC.has(align ?? '')) continue;
    const before = t.getBBox().y;
    t.removeAttribute('dominant-baseline');
    t.removeAttribute('alignment-baseline');
    t.style.dominantBaseline = 'auto';
    t.style.alignmentBaseline = 'auto';
    const shift = before - t.getBBox().y;
    // In the text's own coordinates: after its transform (a rotated axis title moves along its own y).
    if (Math.abs(shift) > 1e-6) {
      t.setAttribute('transform', `${t.getAttribute('transform') ?? ''} translate(0 ${shift})`.trim());
    }
  }
}

/**
 * svg2pdf ignores `paint-order`, so a text's halo stroke would be painted over its glyphs. Draw the halo
 * as a separate copy behind the text instead, and the text itself without a stroke.
 */
export function splitHalos(root: SVGSVGElement) {
  for (const t of Array.from(root.querySelectorAll<SVGTextElement>('text'))) {
    if (
      !t.style.getPropertyValue('paint-order').startsWith('stroke') ||
      !t.style.stroke ||
      t.style.stroke === 'none'
    )
      continue;
    const halo = t.cloneNode(true) as SVGTextElement;
    halo.style.fill = 'none';
    halo.style.textDecoration = 'none';
    t.parentNode!.insertBefore(halo, t);
    t.style.stroke = 'none';
  }
}

/**
 * svg2pdf ignores `text-decoration`. Draw each underlined text's underline as a rectangle in the text's
 * color, where Chromium draws it on screen: as thick as the font's underline (`metrics` of the font it is
 * drawn in), its top at the font's underline position but at least half its thickness (rounded up, ≥ 1 px)
 * below the baseline. (Browsers ignore text-underline-offset on SVG text; WebKit draws it about 1 px lower.)
 */
export function drawUnderlines(root: SVGSVGElement, metrics: (t: SVGTextElement) => Underline | undefined) {
  for (const t of Array.from(root.querySelectorAll<SVGTextElement>('text'))) {
    if (!/underline/.test(t.style.textDecoration) || t.style.fill === 'none') continue;
    const m = metrics(t) ?? { offset: 0.1, thickness: 0.05 };
    const size = Number.parseFloat(getComputedStyle(t).fontSize);
    const box = t.getBBox();
    const baseline = Number.parseFloat(t.getAttribute('y') ?? '0') || 0;
    const thickness = m.thickness * size;
    const top = Math.max(m.offset * size, Math.max(1, Math.ceil(thickness / 2)));
    const line = document.createElementNS(SVG_NS, 'rect');
    line.setAttribute('x', String(box.x));
    line.setAttribute('y', String(baseline + top));
    line.setAttribute('width', String(box.width));
    line.setAttribute('height', String(thickness));
    line.setAttribute('style', `fill:${t.style.fill || 'black'};stroke:none;opacity:${t.style.opacity || 1}`);
    const tr = t.getAttribute('transform');
    if (tr) line.setAttribute('transform', tr);
    t.style.textDecoration = 'none';
    t.parentNode!.insertBefore(line, t.nextSibling);
  }
}
