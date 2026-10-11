import type { RasterResponse } from '@flowmeris/engine';
import type { PlotSpec, Transform } from '@flowmeris/model';
import { encodePngCompressed } from '@flowmeris/render';
import type { FigureSource } from './figure.ts';
import { SVG_NS, bytesToBase64, standaloneClone } from './standalone.ts';

/**
 * Gate-view plot export (method M-EXPORT-PLOT). Axes, gates, labels, contours and histograms are
 * exported as vector SVG; event rasters (dot / pseudocolor / density) are re-rendered at the requested
 * DPI and embedded as PNG.
 */

export interface PlotMargin {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** What a mounted PlotCanvas exposes for export: its SVG, its current raster and its layout. */
export interface PlotHandle {
  svg: SVGSVGElement | null;
  raster: RasterResponse | null;
  size: { width: number; height: number; margin: PlotMargin };
}

/** The data behind an exported plot. state/export.ts builds it from the store. */
export interface PlotExportSource {
  /** Renders `plot`'s events at `width` × `height` px (the worker pool's raster). */
  raster(plot: PlotSpec, width: number, height: number): Promise<RasterResponse>;
  /** SHA-256 of the sample's file, recorded in the SVG metadata. */
  sha256: string | undefined;
  /** The axes' transforms, recorded in the SVG metadata. */
  transforms: { x: Transform | undefined; y: Transform | undefined };
  /** Generator string recorded in the SVG metadata (app name, version, commit). */
  generator: string;
}

/** The plot's events rendered for export at `scale` × the on-screen size (point size and smoothing scaled too). */
function hiResRaster(plot: PlotSpec, pw: number, ph: number, scale: number, source: PlotExportSource) {
  const style = {
    ...plot.style,
    pointPx: Math.min(10 * scale, plot.style.pointPx * scale),
    smoothSigmaBins: plot.style.smoothSigmaBins * scale,
  };
  return source.raster({ ...plot, style }, Math.round(pw * scale), Math.round(ph * scale));
}

/** The plot as a standalone SVG: vector axes and gates, the event raster re-rendered at `dpi`, provenance metadata. */
async function buildPlotSvg(
  h: PlotHandle,
  plot: PlotSpec,
  dpi: number,
  source: PlotExportSource,
): Promise<string> {
  if (!h.svg) throw new Error('Plot not ready');
  const { width, height, margin } = h.size;
  const pw = width - margin.l - margin.r;
  const ph = height - margin.t - margin.b;
  // Edit handles and drafts are on-screen only.
  const clone = standaloneClone(h.svg, '[data-handle], .draft, .draft-vertex');
  clone.removeAttribute('style');
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  if (plot.kind !== 'histogram') {
    const r = await hiResRaster(plot, pw, ph, dpi / 96, source);
    const png = await encodePngCompressed(r.rgba, r.width, r.height, dpi);
    const img = document.createElementNS(SVG_NS, 'image');
    img.setAttribute('x', String(margin.l));
    img.setAttribute('y', String(margin.t));
    img.setAttribute('width', String(pw));
    img.setAttribute('height', String(ph));
    img.setAttribute('preserveAspectRatio', 'none');
    img.setAttribute('href', `data:image/png;base64,${bytesToBase64(png)}`);
    clone.insertBefore(img, bg.nextSibling);
  }
  const meta = document.createElementNS(SVG_NS, 'metadata');
  meta.textContent = JSON.stringify({
    generator: source.generator,
    sample: source.sha256,
    plot,
    transforms: source.transforms,
    rasterDpi: dpi,
  });
  clone.insertBefore(meta, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

/**
 * A Gate-view or Plot-grid plot as a figure: SVG is written as built; PNG, JPEG and PDF render it (axes and
 * gates stay vector in the PDF, the event raster is embedded at the export DPI).
 */
export function plotFigure(h: PlotHandle, plot: PlotSpec, source: PlotExportSource): FigureSource {
  return { build: (dpi) => buildPlotSvg(h, plot, dpi, source) };
}
