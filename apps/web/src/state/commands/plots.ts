import type { Group, PlotCell, PlotSpec, Workspace } from '@flowmeris/model';
import { defaultAxis } from '../../lib/axisDefaults.ts';
import { withAxesChange } from '../../lib/figure.ts';
import { UNSAVED_PLOT_ID } from '../../lib/unsavedPlot.ts';
import { mutateGroup, useStore } from '../store.ts';

/** Commands on a group's plots: the Gate view's, the Tiles view's and the Plot view's grid. */

/**
 * Select population `popId` in the Gate view. A population without a saved plot shows one unsaved until
 * it is edited (lib/unsavedPlot.ts).
 */
export function drill(popId: string) {
  useStore.getState().setUi({ popId, plotId: null, unsavedPlot: null, selectedGateId: null });
}

/** The fields the plot-type and axis pickers edit; shared by saved plots and reference plots. */
export type PlotAxes = Pick<PlotSpec, 'kind' | 'x' | 'y' | 'style'>;
export type EditAxes = (label: string, fn: (p: PlotAxes, g: Group, w: Workspace) => void) => void;

/** Which of a group's plots a settings panel edits: the Gate view's, the Tiles view's, or the Plot view's grid. */
export type PlotTarget = 'gate' | 'tiles' | 'grid';

/** The group's plots of `target`; a grid cell is edited as a plot (its sample and overlays aside). */
export function plotsOf(g: Group, target: PlotTarget): PlotSpec[] {
  if (target === 'tiles') return g.tilePlots;
  if (target === 'grid') return g.grid.cells.filter((c): c is PlotCell => c !== null);
  return g.plots;
}

/** Edit the group's plot `plotId` of `target`. */
export function editPlot(
  groupId: string,
  plotId: string,
  label: string,
  fn: (p: PlotSpec, g: Group, w: Workspace) => void,
  target: PlotTarget = 'gate',
) {
  mutateGroup(groupId, label, (g, w) => {
    const p = plotsOf(g, target).find((x) => x.id === plotId);
    if (p) fn(p, g, w);
  });
}

/** Edits the group's plot `plotId` of `target` (the Tiles or grid plots leave the Gate view's alone). */
export const targetEdit =
  (groupId: string, plotId: string, target: PlotTarget): EditAxes =>
  (label, fn) =>
    editPlot(groupId, plotId, label, fn, target);

/** Edits the group's Tiles plot `plotId`, leaving the Gate view's plots alone. */
export const tilesEdit = (groupId: string, plotId: string): EditAxes => targetEdit(groupId, plotId, 'tiles');

/** Put `channel` on a plot's axis with that channel's default scale. */
export function setAxisChannel(edit: EditAxes, axis: 'x' | 'y', channel: string) {
  edit('Change axis channel', (p, g, w) => {
    withAxesChange(p, () => {
      p[axis] = { ...defaultAxis(w, g, channel) };
    });
  });
}

/** Changes the axis channel of the population's plot, or of `edit`'s target (for clickable axis titles). */
export function axisChannelSetter(group: Group, plot: PlotSpec, edit?: EditAxes) {
  return axisPickers(group, plot, edit).onPickChannel;
}

/**
 * Props making a plot's axis titles clickable: the x / y channel, or what a histogram's y axis shows
 * (`histNorm`), of the population's plot or of `edit`'s target.
 */
export function axisPickers(group: Group, plot: PlotSpec, edit?: EditAxes) {
  const ed: EditAxes = edit ?? ((label, fn) => editPlot(group.id, plot.id, label, fn));
  return {
    onPickChannel: (axis: 'x' | 'y', channel: string) => setAxisChannel(ed, axis, channel),
    onPickHistNorm: (norm: PlotSpec['style']['histNorm']) =>
      ed('Change histogram y axis', (p) => {
        p.style.histNorm = norm;
      }),
  };
}

/**
 * Open a Gating path plot of `popId` in the Gate view: a saved plot (`real`) as it is, a plot built from a
 * gate's axes unsaved until it is edited, or with no plot the population's own (`drill`).
 */
export function openPathPlot(popId: string, plot: PlotSpec | null, real: boolean) {
  const st = useStore.getState();
  if (plot && real) st.setUi({ popId, plotId: plot.id, selectedGateId: null, view: 'gate' });
  else if (plot) {
    const unsavedPlot = { ...structuredClone(plot), id: UNSAVED_PLOT_ID };
    st.setUi({ popId, plotId: UNSAVED_PLOT_ID, unsavedPlot, selectedGateId: null, view: 'gate' });
  } else {
    drill(popId);
    useStore.getState().setUi({ view: 'gate' });
  }
}
