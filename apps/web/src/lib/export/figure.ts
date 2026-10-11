import { download, safeName } from '../download.ts';
import { installedFonts } from '../fonts/index.ts';
import { embedFontFaces } from './fontFaces.ts';
import { FORMATS, type ImageFormat, type Warn } from './formats.ts';
import { withMounted } from './mount.ts';
import { svgToPdf } from './pdf.ts';
import { svgToJpeg, svgToPng } from './raster.ts';
import { standaloneSvg } from './standalone.ts';

/**
 * Figure export (method M-EXPORT-PLOT): every figure, whatever view draws it, is exported here. A view
 * describes its figure as a `FigureSource`, which builds standalone SVG markup; the markup is laid out
 * off-screen and each format's writer turns it into a file, with the fonts embedded (ADR-0011).
 */

/** A figure to export. */
export interface FigureSource {
  /** The figure as standalone SVG markup; `dpi` is the resolution of any raster it embeds. */
  build(dpi: number): Promise<string>;
}

/** An on-screen SVG figure (charts, ridge plots), exported as drawn. */
export function svgFigure(svg: SVGSVGElement): FigureSource {
  return { build: async () => standaloneSvg(svg) };
}

type Writer = (el: SVGSVGElement, dpi: number, warn?: Warn) => Promise<Blob | Uint8Array | string>;

/**
 * How each format writes the laid-out standalone SVG. The PDF embeds its fonts itself; the others carry
 * them as @font-face rules.
 */
const WRITERS: Record<ImageFormat, Writer> = {
  pdf: (el, _dpi, warn) => svgToPdf(el, warn),
  png: async (el, dpi, warn) => {
    await embedFontFaces(el, warn);
    return svgToPng(el, dpi);
  },
  jpeg: async (el, dpi, warn) => {
    await embedFontFaces(el, warn);
    return svgToJpeg(el, dpi);
  },
  svg: async (el, _dpi, warn) => {
    await embedFontFaces(el, warn);
    return new XMLSerializer().serializeToString(el);
  },
};

/** The file contents of `figure` as `format`; `dpi` sizes PNG and JPEG and any embedded event raster. */
export async function writeFigure(
  figure: FigureSource,
  format: ImageFormat,
  dpi: number,
  warn?: Warn,
): Promise<Blob | Uint8Array | string> {
  // A PDF may embed installed fonts: ask for them while the click that started the export still counts as
  // a user gesture (the browser's permission prompt needs one), before building the figure takes time.
  if (format === 'pdf') void installedFonts();
  const markup = await figure.build(dpi);
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
