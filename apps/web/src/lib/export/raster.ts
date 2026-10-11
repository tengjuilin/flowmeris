import { encodePngCompressed } from '@flowmeris/render';
import { standaloneSvg } from './standalone.ts';

/** PNG and JPEG export of a laid-out standalone SVG (method M-EXPORT-PLOT). The SVG's px are 96 dpi. */

/** Draw an SVG onto a canvas at `dpi`; `background` fills first. */
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

/** Rasterize an SVG to a PNG at `dpi`, recorded in its pHYs chunk. */
export async function svgToPng(svg: SVGSVGElement, dpi: number): Promise<Uint8Array> {
  const { canvas, ctx } = await svgToCanvas(svg, dpi);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return encodePngCompressed(data, canvas.width, canvas.height, dpi);
}

/** Rasterize an SVG to a JPEG (white background) at `dpi`. */
export async function svgToJpeg(svg: SVGSVGElement, dpi: number): Promise<Uint8Array> {
  const { canvas } = await svgToCanvas(svg, dpi, '#ffffff');
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('JPEG encoding failed'))), 'image/jpeg', 0.95),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
