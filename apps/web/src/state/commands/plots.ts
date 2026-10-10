import type { Group, PlotCell, PlotSpec, Workspace } from '@flowmeris/model';
import { defaultAxis } from '../../lib/axisDefaults.ts';
import { withAxesChange } from '../../lib/figure.ts';
import { newPlot } from '../../lib/plotFactories.ts';
import { mutateGroup, useStore } from '../store.ts';

/** Commands on a group's plots: the Gate view's, the Tiles view's and the Plot view's grid. */

/** Make sure the active population has a plot (creates one with the parent's axes). */
export function ensurePlot(popId: string): string {
  const st = useStore.getState();
  const g = st.ws.groups.find((x) => x.id === st.ui.groupId);
  if (!g) return '';
  const existing = g.plots.find((p) => p.population === popId);
  if (existing) return existing.id;
  let id = '';
  st.mutate('Add plot', (ws) => {
    const gg = ws.groups.find((x) => x.id === g.id)!;
    const pop = gg.template.populations[popId];
    const parentGate = pop?.gate ? gg.template.gates[pop.gate] : undefined;
    const parentPlot = gg.plots.find((p) => p.population === parentGate?.parentPop);
    const xy: [string, string] | undefined = parentPlot?.y
      ? [parentPlot.x.channel, parentPlot.y.channel]
      : undefined;
    id = newPlot(
      ws,
      gg,
      popId,
      parentPlot?.kind === 'histogram' ? 'pseudocolor' : (parentPlot?.kind ?? 'pseudocolor'),
      xy,
    ).id;
  });
  return id;
}

/** Select population `popId` in the Gate view, making its plot first if it has none. */
export function drill(popId: string) {
  const id = ensurePlot(popId);
  useStore.getState().setUi({ popId, plotId: id, selectedGateId: null });
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
