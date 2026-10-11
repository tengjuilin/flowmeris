import { download, safeName } from '../download.ts';
import { FORMATS, type ImageFormat } from './formats.ts';
import { withMounted } from './mount.ts';
import { svgToPdf } from './pdf.ts';
import { svgToJpeg, svgToPng } from './raster.ts';
import { standaloneSvg } from './standalone.ts';

/**
 * Figure export (method M-EXPORT-PLOT): every figure, whatever view draws it, is exported here. A view
 * describes its figure as a `FigureSource`, which builds standalone SVG markup; each format writes that
 * markup (svg as is; png, jpeg and pdf after laying it out off-screen).
 */

/** Messages for the user (e.g. fonts the PDF had to substitute). */
export type Warn = (message: string) => void;

/** A figure to export. */
export interface FigureSource {
  /** The figure as standalone SVG markup; `dpi` is the resolution of any raster it embeds. */
  build(dpi: number): Promise<string>;
}

/** An on-screen SVG figure (charts, ridge plots), exported as drawn. */
export function svgFigure(svg: SVGSVGElement): FigureSource {
  return { build: async () => standaloneSvg(svg) };
}

type Writer = (el: SVGSVGElement, dpi: number, warn?: Warn) => Promise<Blob | Uint8Array>;

/** How each format writes the laid-out standalone SVG (svg is written without laying it out). */
const WRITERS: Record<Exclude<ImageFormat, 'svg'>, Writer> = {
  pdf: (el, _dpi, warn) => svgToPdf(el, warn),
  png: (el, dpi) => svgToPng(el, dpi),
  jpeg: (el, dpi) => svgToJpeg(el, dpi),
};

/** The file contents of `figure` as `format`; `dpi` sizes PNG and JPEG and any embedded event raster. */
export async function writeFigure(
  figure: FigureSource,
  format: ImageFormat,
  dpi: number,
  warn?: Warn,
): Promise<Blob | Uint8Array | string> {
  const markup = await figure.build(dpi);
  if (format === 'svg') return markup;
  const write = WRITERS[format];
  return withMounted(markup, (el) => write(el, dpi, warn));
}

/** Download `figure` as `format`, named `baseName` (made file-safe) with the format's extension. */
export async function exportFigure(
  figure: FigureSource,
  format: ImageFormat,
  baseName: string,
  dpi: number,
  warn?: Warn,
) {
  const { ext, mime } = FORMATS[format];
  download(`${safeName(baseName)}.${ext}`, await writeFigure(figure, format, dpi, warn), mime);
}
