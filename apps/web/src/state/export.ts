import type { PlotSpec } from '@flowmeris/model';
import { getPool } from '../engine-client/pool.ts';
import {
  type FigureSource,
  type ImageFormat,
  type PlotExportSource,
  type PlotHandle,
  exportFigure as exportFigureFile,
  plotFigure,
} from '../lib/export/index.ts';
import { APP_INFO, contextFor, toast, useStore } from './store.ts';

/** Figure export wired to the app: warnings go to the toast, plot data comes from the store and the worker pool. */

/** Download `figure` (see lib/export); messages for the user, such as substituted fonts, are toasted. */
export function exportFigure(figure: FigureSource, format: ImageFormat, baseName: string, dpi: number) {
  return exportFigureFile(figure, format, baseName, dpi, toast);
}

/**
 * The selected group's data for exporting `plot`: events of `sampleId` (by default the selected sample, or
 * the group's first sample when none of its samples is selected), rendered by the worker pool.
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

/** A plot of the selected group as a figure, with the events of `sampleId` (default: as plotSource). */
export function storePlotFigure(h: PlotHandle, plot: PlotSpec, sampleId?: string): FigureSource {
  return plotFigure(h, plot, plotSource(plot, sampleId));
}
