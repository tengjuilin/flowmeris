/**
 * Standalone SVG of an on-screen figure (method M-EXPORT-PLOT): the clone every export format starts
 * from, with the styles the app's CSS gives each element written inline.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'paint-order',
];

/** Write `src`'s computed styles (STYLE_PROPS) inline on its clone `dst`, recursively, dropping classes. */
export function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  const parts = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).filter((s) => !s.endsWith(':'));
  dst.setAttribute('style', parts.join(';'));
  dst.removeAttribute('class');
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i]!, dst.children[i]!);
}

/**
 * A detached copy of an on-screen SVG with its styles inlined, its namespace and viewBox set, and the
 * elements matching `remove` (on-screen-only parts) taken out.
 */
export function standaloneClone(svg: SVGSVGElement, remove: string): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  for (const n of Array.from(clone.querySelectorAll(remove))) n.remove();
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('viewBox', `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
  return clone;
}

/** Serialize an on-screen SVG as a standalone file, with its CSS-derived styles inlined. */
export function standaloneSvg(svg: SVGSVGElement): string {
  // On-screen hints (e.g. on draggable gate labels) are not part of the figure.
  return new XMLSerializer().serializeToString(standaloneClone(svg, 'title'));
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
