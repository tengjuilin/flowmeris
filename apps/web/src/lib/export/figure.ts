import { download, safeName } from '../download.ts';
import { svgToPdf } from './pdf.ts';
import { type ImageFormat, standaloneSvg, svgToJpeg, svgToPng } from './svg.ts';

/**
 * Export an on-screen SVG figure as `format`; `dpi` applies to PNG and JPEG only (SVG and PDF are vector).
 * `warn` receives messages for the user (fonts substituted in a PDF).
 */
export async function exportSvgFigure(
  svg: SVGSVGElement,
  format: ImageFormat,
  baseName: string,
  dpi: number,
  warn?: (message: string) => void,
) {
  const name = safeName(baseName);
  if (format === 'svg') return download(`${name}.svg`, standaloneSvg(svg), 'image/svg+xml');
  if (format === 'png') return download(`${name}.png`, await svgToPng(svg, dpi), 'image/png');
  if (format === 'pdf') return download(`${name}.pdf`, await svgToPdf(svg, warn), 'application/pdf');
  download(`${name}.jpg`, (await svgToJpeg(svg, dpi)).bytes, 'image/jpeg');
}
