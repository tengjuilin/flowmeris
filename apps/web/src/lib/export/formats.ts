/**
 * The figure export formats, in the order the Export menu lists them. To add a format, add it here and
 * its writer to `WRITERS` in figure.ts (the type checker asks for both).
 */

export type ImageFormat = 'pdf' | 'png' | 'jpeg' | 'svg';

export interface FormatInfo {
  /** The Export menu's label. */
  label: string;
  /** File extension, without the dot. */
  ext: string;
  mime: string;
  /** Rendered to pixels at a chosen DPI (otherwise vector, with only event rasters at the DPI). */
  raster: boolean;
}

export const FORMATS: Record<ImageFormat, FormatInfo> = {
  pdf: { label: 'PDF (vector)', ext: 'pdf', mime: 'application/pdf', raster: false },
  png: { label: 'PNG', ext: 'png', mime: 'image/png', raster: true },
  jpeg: { label: 'JPG', ext: 'jpg', mime: 'image/jpeg', raster: true },
  svg: { label: 'SVG (vector)', ext: 'svg', mime: 'image/svg+xml', raster: false },
};

export const FORMAT_IDS = Object.keys(FORMATS) as ImageFormat[];

/** Export DPI: 300 by default, kept within 72–1200. */
export function clampDpi(dpi: number): number {
  return Math.min(1200, Math.max(72, dpi || 300));
}

/** Messages for the user (e.g. fonts an export had to substitute). */
export type Warn = (message: string) => void;
