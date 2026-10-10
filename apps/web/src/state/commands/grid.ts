import type { Group, PlotCell, PlotKind, PlotSpec, Workspace } from '@flowmeris/model';
import { newId } from '@flowmeris/model';
import { defaultAxis, defaultChannels } from '../../lib/axisDefaults.ts';
import { TILE_FIGURE, TILE_STYLE, withAxesChange } from '../../lib/figure.ts';
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

/** Whether `plot` has `cell`'s type and axes (channel, compensation, scale and range); a histogram's y is ignored. */
function sameTypeAndAxes(plot: PlotSpec, cell: PlotCell): boolean {
  return (
    plot.kind === cell.kind &&
    sameJson(plot.x, cell.x) &&
    (cell.kind === 'histogram' || sameJson(plot.y, cell.y))
  );
}

/**
 * Open a cell in the Tiles view: its population, with its sample selected (highlighted), and the
 * population's Tiles plot set to the cell's type and axes. That is one undo step, and none when the Tiles
 * plot already matches. The Tiles plot keeps its own appearance. A sample unchecked in the sidebar has no
 * tile; a toast says to check it, naming the sample `name`.
 */
export function openInTilesView(group: Group, cell: PlotCell, sampleId: string | undefined, name = sampleId) {
  const tile = group.tilePlots.find((p) => p.population === cell.population);
  if (!tile || !sameTypeAndAxes(tile, cell)) {
    mutateGroup(group.id, 'Open grid plot in Tiles view', (g, w) => {
      const p =
        g.tilePlots.find((x) => x.population === cell.population) ?? newTilePlot(w, g, cell.population);
      withAxesChange(p, () => {
        p.kind = cell.kind;
        p.x = { ...cell.x };
        if (cell.kind !== 'histogram' && cell.y) p.y = { ...cell.y };
      });
    });
  }
  useStore.getState().setUi({
    view: 'tiles',
    popId: cell.population,
    selectedGateId: null,
    ...(sampleId ? { sampleId } : {}),
  });
  if (sampleId && useStore.getState().ui.excluded[sampleId])
    toast(`${name} is unchecked in the sidebar: check it to show its tile.`);
}

/**
 * Open a Tiles plot of `sampleId` in the Plot view: select the grid plot already showing it (same
 * population, type and axes, pinned to that sample), else put a copy pinned to the sample in the next
 * empty cell, leaving the other grid plots as they are.
 */
export function openTileInGrid(group: Group, plot: PlotSpec, sampleId: string) {
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
    mutateGroup(group.id, 'Open tile in Plot view', (g) => {
      const slot = g.grid.cells.findIndex((c) => c === null);
      const c: PlotCell = {
        id: cellId,
        population: plot.population,
        sampleId,
        overlay: [],
        kind: plot.kind,
        x: { ...plot.x },
        ...(plot.y && plot.kind !== 'histogram' ? { y: { ...plot.y } } : {}),
        // A tile drawn with the Tiles defaults leaves the cell on the grid defaults (the same).
        style:
          plot.style.figure === TILE_FIGURE
            ? structuredClone({ ...plot.style, figure: undefined })
            : structuredClone(plot.style),
      };
      if (slot >= 0) g.grid.cells[slot] = c;
      else g.grid.cells.push(c);
    });
    id = cellId;
  }
  useStore.getState().setUi({ view: 'plot', sampleId, gridCellId: id, selectedGateId: null });
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
