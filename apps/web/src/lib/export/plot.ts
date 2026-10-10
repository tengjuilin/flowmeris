import type { RasterResponse } from '@flowmeris/engine';
import type { PlotSpec, Transform } from '@flowmeris/model';
import { encodePngCompressed } from '@flowmeris/render';
import { download, safeName } from '../download.ts';
import { stripDataExt } from '../files.ts';
import { exportSvgFigure } from './figure.ts';
import { type ImageFormat, bytesToBase64, inlineStyles } from './svg.ts';

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
export async function buildPlotSvg(
  h: PlotHandle,
  plot: PlotSpec,
  dpi: number,
  source: PlotExportSource,
): Promise<string> {
  if (!h.svg) throw new Error('Plot not ready');
  const { width, height, margin } = h.size;
  const pw = width - margin.l - margin.r;
  const ph = height - margin.t - margin.b;
  const clone = h.svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(h.svg, clone);
  clone.querySelectorAll('[data-handle], .draft, .draft-vertex').forEach((n) => n.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.removeAttribute('style');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  if (plot.kind !== 'histogram') {
    const r = await hiResRaster(plot, pw, ph, dpi / 96, source);
    const png = await encodePngCompressed(r.rgba, r.width, r.height, dpi);
    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    img.setAttribute('x', String(margin.l));
    img.setAttribute('y', String(margin.t));
    img.setAttribute('width', String(pw));
    img.setAttribute('height', String(ph));
    img.setAttribute('preserveAspectRatio', 'none');
    img.setAttribute('href', `data:image/png;base64,${bytesToBase64(png)}`);
    clone.insertBefore(img, bg.nextSibling);
  }
  const meta = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
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
 * Export a Gate-view plot. SVG is written as built; PNG, JPEG and PDF render that SVG (axes and gates stay
 * vector in the PDF, the event raster is embedded at `dpi`).
 */
export async function exportPlotFigure(
  h: PlotHandle,
  plot: PlotSpec,
  format: ImageFormat,
  baseName: string,
  dpi: number,
  source: PlotExportSource,
  warn?: (message: string) => void,
) {
  const svg = await buildPlotSvg(h, plot, dpi, source);
  const name = stripDataExt(baseName);
  if (format === 'svg') return download(`${safeName(name)}.svg`, svg, 'image/svg+xml');
  // The rasterisers and PDF writer read computed styles, so the figure is laid out off-screen first.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    await exportSvgFigure(host.querySelector('svg')!, format, name, dpi, warn);
  } finally {
    host.remove();
  }
}
