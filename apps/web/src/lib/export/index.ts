/**
 * Figure export: the one place figures become files. Views describe a figure (`svgFigure`, `plotFigure`)
 * and hand it to `exportFigure` (through `state/export.ts`, which adds toasts and the store's data).
 * See apps/web/CLAUDE.md, "Figure export".
 */
export { type FigureSource, exportFigure, svgFigure, writeFigure } from './figure.ts';
export { FORMATS, FORMAT_IDS, type FormatInfo, type ImageFormat, type Warn, clampDpi } from './formats.ts';
export { type PlotExportSource, type PlotHandle, type PlotMargin, plotFigure } from './plot.ts';
