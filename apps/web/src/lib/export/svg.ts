import { encodePngCompressed } from '../download.ts';

/**
 * Plot and figure export (method M-EXPORT-PLOT): on-screen SVG figures as standalone SVG, PNG and
 * JPEG. PDF is in pdf.ts, Gate-view plots (vector SVG with the event raster re-rendered at the export
 * DPI) in plot.ts.
 */

export type ImageFormat = 'svg' | 'png' | 'jpeg' | 'pdf';

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

export function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  const parts = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).filter((s) => !s.endsWith(':'));
  dst.setAttribute('style', parts.join(';'));
  dst.removeAttribute('class');
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i]!, dst.children[i]!);
}

/** Serialise an on-screen SVG as a standalone file, with its CSS-derived styles inlined. */
export function standaloneSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  // On-screen hints (e.g. on draggable gate labels) are not part of the figure.
  for (const t of Array.from(clone.querySelectorAll('title'))) t.remove();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
  return new XMLSerializer().serializeToString(clone);
}

/** Draw an on-screen SVG onto a canvas at `dpi` (the SVG's px are 96 dpi); `background` fills first. */
async function svgToCanvas(svg: SVGSVGElement, dpi: number, background?: string) {
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  const scale = dpi / 96;
  const url = URL.createObjectURL(new Blob([standaloneSvg(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d')!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Rasterise an on-screen SVG to a PNG at `dpi` (the SVG's px are 96 dpi). */
export async function svgToPng(svg: SVGSVGElement, dpi: number): Promise<Uint8Array> {
  const { canvas, ctx } = await svgToCanvas(svg, dpi);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return encodePngCompressed(data, canvas.width, canvas.height, dpi);
}

/** Rasterise an on-screen SVG to a JPEG (white background) at `dpi`. */
export async function svgToJpeg(
  svg: SVGSVGElement,
  dpi: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const { canvas } = await svgToCanvas(svg, dpi, '#ffffff');
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('JPEG encoding failed'))), 'image/jpeg', 0.95),
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
