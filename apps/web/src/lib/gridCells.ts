import type { Group, PlotCell, PlotSpec } from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import { TILE_FIGURE } from './figure.ts';

/** Plot view grid cells: the sample a cell shows, its overlay colours, and the cell as a plot to draw. */

/** The sample a cell gates and shows: its pinned sample, else the selected one. */
export function cellSample(group: Group, cell: PlotCell, selected: string | null): string | undefined {
  if (cell.sampleId && group.sampleIds.includes(cell.sampleId)) return cell.sampleId;
  return selected && group.sampleIds.includes(selected) ? selected : group.sampleIds[0];
}

/** Colours of a cell's samples: the plotted sample first, then the overlays in order. */
export function overlayColors(cell: PlotCell, sampleId: string, group: Group) {
  const others = cell.overlay.filter((id) => id !== sampleId && group.sampleIds.includes(id));
  const color = (i: number) => CATEGORICAL[i % CATEGORICAL.length]!;
  return { color: color(0), samples: others.map((id, i) => ({ sampleId: id, color: color(i + 1) })) };
}

/** A cell as a plot to draw; one without saved figure options is drawn with the grid (Tiles) defaults. */
export function plotOf(cell: PlotCell): PlotSpec {
  return {
    id: cell.id,
    population: cell.population,
    kind: cell.kind,
    x: cell.x,
    style: cell.style.figure ? cell.style : { ...cell.style, figure: TILE_FIGURE },
    ...(cell.y ? { y: cell.y } : {}),
  };
}
