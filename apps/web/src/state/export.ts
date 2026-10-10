import type { PlotSpec } from '@flowmeris/model';
import { getPool } from '../engine-client/pool.ts';
import { exportSvgFigure as exportSvg } from '../lib/export/figure.ts';
import { type PlotExportSource, type PlotHandle, exportPlotFigure } from '../lib/export/plot.ts';
import type { ImageFormat } from '../lib/export/svg.ts';
import { APP_INFO, contextFor, toast, useStore } from './store.ts';

/** Figure export wired to the app: warnings go to the toast, plot data comes from the store and worker getPool(). */

/** Export an on-screen SVG figure (see lib/export/figure.ts); font substitutions are reported in a toast. */
export function exportSvgFigure(svg: SVGSVGElement, format: ImageFormat, baseName: string, dpi: number) {
  return exportSvg(svg, format, baseName, dpi, toast);
}

/**
 * The selected group's data for exporting `plot`: events of `sampleId` (by default the selected sample, or
 * the group's first sample when none of its samples is selected), rendered by the worker getPool().
 */
export function plotSource(plot: PlotSpec, sampleId?: string): PlotExportSource {
  const st = useStore.getState();
  const g = st.ws.groups.find((x) => x.id === st.ui.groupId)!;
  const id =
    sampleId ?? (st.ui.sampleId && g.sampleIds.includes(st.ui.sampleId) ? st.ui.sampleId : g.sampleIds[0]!);
  return {
    raster: (p, width, height) =>
      getPool().raster(contextFor(st.ws, g), { sampleId: id, plot: p, width, height, dotColor: '#222222' }),
    sha256: st.ws.samples[id]?.sha256,
    transforms: {
      x: st.ws.transforms[plot.x.transform],
      y: plot.y ? st.ws.transforms[plot.y.transform] : undefined,
    },
    generator: `Flowmeris ${APP_INFO.version} (${APP_INFO.commit})`,
  };
}

/**
 * Export a plot of the selected group, with the events of `sampleId` (default: as plotSource). SVG is written as built; PNG, JPEG and PDF render that SVG (axes
 * and gates stay vector in the PDF, the event raster is embedded at `dpi`).
 */
export function exportPlot(
  h: PlotHandle,
  plot: PlotSpec,
  format: ImageFormat,
  baseName: string,
  dpi = 300,
  sampleId?: string,
) {
  return exportPlotFigure(h, plot, format, baseName, dpi, plotSource(plot, sampleId), toast);
}
