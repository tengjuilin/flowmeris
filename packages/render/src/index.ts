/**
 * CPU plot rasteriser (ADR-0001). Produces an RGBA image at pixel resolution
 * plus vector overlays (contour lines). Deterministic: identical input gives
 * byte-identical output, which the golden-image tests rely on.
 */

export { CATEGORICAL, COLORMAPS, colormapCss, colormapLut } from './colormaps.ts';
export * from './raster2d.ts';
export * from './histogram.ts';
export * from './png.ts';
