import type { Group, PlotCell, PlotKind, PlotSpec, PlotStyle, Workspace } from '@flowmeris/model';
import { newId } from '@flowmeris/model';
import { defaultAxis, defaultChannels } from '../../lib/axisDefaults.ts';
import { TILE_FIGURE, TILE_STYLE, withAxesChange } from '../../lib/figure.ts';
import { type DropSide, moveSlot, putSlot } from '../../lib/gridMove.ts';
import { sameJson } from '../../lib/json.ts';
import { newTilePlot } from '../../lib/plotFactories.ts';
import { mutateGroup, toast, useStore } from '../store.ts';

/** Commands on the Plot view's grid. Edits to a grid plot's settings are carried to the others by the store (AFTER_EDIT). */

/** Edit grid cell `cellId` of the group. */
export function editCell(
  groupId: string,
  cellId: string,
  label: string,
  fn: (c: PlotCell, g: Group, w: Workspace) => void,
) {
  mutateGroup(groupId, label, (g, w) => {
    const c = g.grid.cells.find((x) => x?.id === cellId);
    if (c) fn(c, g, w);
  });
}

/** Put a new plot into cell `slot`; its axes are `xy`, or the group's default channels. */
export function addCell(
  groupId: string,
  slot: number,
  kind: PlotKind,
  population: string,
  xy?: [string, string?],
) {
  let id = '';
  mutateGroup(groupId, 'Add plot to grid', (g, w) => {
    const [dx, dy] = defaultChannels(w, g);
    const xc = xy?.[0] ?? dx;
    const yc = xy?.[1] ?? (dy === xc ? dx : dy);
    const c: PlotCell = {
      id: newId('cell_'),
      population: g.template.populations[population] ? population : 'root',
      overlay: [],
      kind,
      x: { ...defaultAxis(w, g, xc) },
      style: structuredClone(TILE_STYLE),
    };
    if (kind !== 'histogram') c.y = { ...defaultAxis(w, g, yc) };
    while (g.grid.cells.length < slot) g.grid.cells.push(null);
    g.grid.cells[slot] = c;
    id = c.id;
  });
  if (id) useStore.getState().setUi({ gridCellId: id });
}

export function removeCell(groupId: string, cellId: string) {
  mutateGroup(groupId, 'Remove plot from grid', (g) => {
    const cells = g.grid.cells.map((c) => (c?.id === cellId ? null : c));
    while (cells.length && cells[cells.length - 1] === null) cells.pop();
    g.grid.cells = cells;
  });
}

/** Open a cell's population, sample and axes in the Gate view, reusing a matching saved plot. */
export function openInGateView(group: Group, cell: PlotCell, sampleId: string | undefined) {
  const same = (p: PlotSpec) =>
    p.population === cell.population &&
    p.kind === cell.kind &&
    p.x.channel === cell.x.channel &&
    (cell.kind === 'histogram' || p.y?.channel === cell.y?.channel);
  let plotId = group.plots.find(same)?.id;
  if (!plotId) {
    const id = newId('plt_');
    mutateGroup(group.id, 'Open grid plot in Gate view', (g) => {
      g.plots.push({
        id,
        population: cell.population,
        kind: cell.kind,
        x: { ...cell.x },
        ...(cell.y ? { y: { ...cell.y } } : {}),
        // The grid's figure options (smaller text) stay with the grid plot.
        style: { ...cell.style, figure: undefined },
      });
    });
    plotId = id;
  }
  useStore.getState().setUi({
    view: 'gate',
    popId: cell.population,
    plotId,
    selectedGateId: null,
    ...(sampleId ? { sampleId } : {}),
  });
}

/** Drag the plot in slot `from` to slot `to` (lib/gridMove.ts `moveSlot`) and select it. */
export function moveCell(groupId: string, from: number, to: number, side: DropSide) {
  let id: string | undefined;
  mutateGroup(groupId, 'Move grid plot', (g) => {
    id = g.grid.cells[from]?.id;
    g.grid.cells = moveSlot(g.grid.cells, from, to, side);
  });
  if (id) useStore.getState().setUi({ gridCellId: id });
}

/** Cut (⌘X: moved on paste) or copy (⌘C) the grid plot `cellId`. */
export function clipCell(group: Group, cellId: string, cut: boolean) {
  const cell = group.grid.cells.find((c) => c?.id === cellId);
  if (cell) useStore.getState().setUi({ gridClip: { groupId: group.id, cell: structuredClone(cell), cut } });
}

/**
 * Paste the cut or copied grid plot into slot `slot`, replacing the plot there, and select it. A copy is a
 * new plot (it can be pasted again); a cut plot moves, leaving its slot empty, and the clipboard empties.
 * Plots paste within the group they were copied from.
 */
export function pasteCell(group: Group, slot: number) {
  const clip = useStore.getState().ui.gridClip;
  if (!clip) return;
  if (clip.groupId !== group.id) {
    toast('Paste a plot into the group it was cut or copied from.');
    return;
  }
  const from = group.grid.cells.findIndex((c) => c?.id === clip.cell.id);
  if (clip.cut && from < 0) {
    toast('The cut plot was deleted.');
    useStore.getState().setUi({ gridClip: null });
    return;
  }
  const id = clip.cut ? clip.cell.id : newId('cell_');
  if (!clip.cut || from !== slot)
    mutateGroup(group.id, clip.cut ? 'Move grid plot' : 'Paste grid plot', (g) => {
      const at = g.grid.cells.findIndex((c) => c?.id === clip.cell.id);
      g.grid.cells = clip.cut
        ? putSlot(g.grid.cells, slot, g.grid.cells[at]!, at)
        : putSlot(g.grid.cells, slot, { ...structuredClone(clip.cell), id });
    });
  useStore.getState().setUi({ gridCellId: id, ...(clip.cut ? { gridClip: null } : {}) });
}

/** What a plot shows, for opening it in another view: a grid cell, a tile or the Gate view's plot. */
type ShownPlot = Pick<PlotSpec, 'population' | 'kind' | 'x' | 'y' | 'style'>;

/**
 * Whether `plot` has `from`'s type and axes: the x and y channel, compensation, scale and range, or for a
 * histogram the x axis and what its y axis shows (`histNorm`).
 */
function sameTypeAndAxes(plot: PlotSpec, from: ShownPlot): boolean {
  return (
    plot.kind === from.kind &&
    sameJson(plot.x, from.x) &&
    (from.kind === 'histogram' ? plot.style.histNorm === from.style.histNorm : sameJson(plot.y, from.y))
  );
}

/**
 * Open a plot (a grid cell, or the Gate view's plot) in the Tiles view: its population, with its sample
 * selected (highlighted), and the population's Tiles plot set to its type and axes (`sameTypeAndAxes`).
 * That is one undo step named `label`, and none when the Tiles plot already matches. The Tiles plot keeps
 * its own appearance. A sample unchecked in the sidebar has no tile; a toast says to check it, naming the
 * sample `name`.
 */
export function openInTilesView(
  group: Group,
  from: ShownPlot,
  sampleId: string | undefined,
  name = sampleId,
  label = 'Open grid plot in Tiles view',
) {
  const tile = group.tilePlots.find((p) => p.population === from.population);
  if (!tile || !sameTypeAndAxes(tile, from)) {
    mutateGroup(group.id, label, (g, w) => {
      const p =
        g.tilePlots.find((x) => x.population === from.population) ?? newTilePlot(w, g, from.population);
      withAxesChange(p, () => {
        p.kind = from.kind;
        p.x = { ...from.x };
        if (from.kind !== 'histogram' && from.y) p.y = { ...from.y };
      });
      // After the axes change, which may restore the settings saved for the new channel pair.
      if (from.kind === 'histogram') p.style.histNorm = from.style.histNorm;
    });
  }
  useStore.getState().setUi({
    view: 'tiles',
    popId: from.population,
    selectedGateId: null,
    ...(sampleId ? { sampleId } : {}),
  });
  if (sampleId && useStore.getState().ui.excluded[sampleId])
    toast(`${name} is unchecked in the sidebar: check it to show its tile.`);
}

/**
 * Open `plot` of `sampleId` in the Plot view: select the grid plot already showing it (same population,
 * type and axes, pinned to that sample), else put a copy with `style` pinned to the sample in the next
 * empty cell (undo step `label`), leaving the other grid plots as they are.
 */
function openInGrid(group: Group, plot: ShownPlot, sampleId: string, label: string, style: PlotStyle) {
  const same = (c: PlotCell | null): c is PlotCell =>
    !!c &&
    c.sampleId === sampleId &&
    c.population === plot.population &&
    c.kind === plot.kind &&
    c.x.channel === plot.x.channel &&
    (plot.kind === 'histogram' || c.y?.channel === plot.y?.channel);
  let id = group.grid.cells.find(same)?.id;
  if (!id) {
    const cellId = newId('cell_');
    mutateGroup(group.id, label, (g) => {
      const slot = g.grid.cells.findIndex((c) => c === null);
      const c: PlotCell = {
        id: cellId,
        population: plot.population,
        sampleId,
        overlay: [],
        kind: plot.kind,
        x: { ...plot.x },
        ...(plot.y && plot.kind !== 'histogram' ? { y: { ...plot.y } } : {}),
        style: structuredClone(style),
      };
      if (slot >= 0) g.grid.cells[slot] = c;
      else g.grid.cells.push(c);
    });
    id = cellId;
  }
  useStore.getState().setUi({ view: 'plot', sampleId, gridCellId: id, selectedGateId: null });
}

/** Open a Tiles plot of `sampleId` in the Plot view (`openInGrid`). */
export function openTileInGrid(group: Group, plot: PlotSpec, sampleId: string) {
  // A tile drawn with the Tiles defaults leaves the cell on the grid defaults (the same).
  const style = plot.style.figure === TILE_FIGURE ? { ...plot.style, figure: undefined } : plot.style;
  openInGrid(group, plot, sampleId, 'Open tile in Plot view', style);
}

/**
 * Open the Gate view's plot of `sampleId` in the Plot view (`openInGrid`). Its figure options (larger
 * text) stay with the Gate view's plot; the cell is drawn with the grid defaults.
 */
export function openGatePlotInGrid(group: Group, plot: PlotSpec, sampleId: string) {
  openInGrid(group, plot, sampleId, 'Open Gate plot in Plot view', { ...plot.style, figure: undefined });
}

export function setCellPopulation(groupId: string, cellId: string, popId: string) {
  editCell(groupId, cellId, 'Change grid plot population', (c) => void (c.population = popId));
}

/** Pin a cell to `sampleId`, or let it follow the sidebar selection when there is none. */
export function setCellSample(groupId: string, cellId: string, sampleId: string | undefined) {
  editCell(groupId, cellId, 'Change grid plot sample', (c) => {
    if (sampleId) c.sampleId = sampleId;
    else c.sampleId = undefined;
  });
}

export function clearCellOverlay(groupId: string, cellId: string) {
  editCell(groupId, cellId, 'Clear grid plot overlay', (c) => void (c.overlay = []));
}
