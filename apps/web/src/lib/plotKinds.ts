import type { PlotKind } from '@flowmeris/model';

/** The plot types in the order the plot type menus list them, with their names. */
export const PLOT_KINDS: { id: PlotKind; label: string }[] = [
  { id: 'pseudocolor', label: 'Pseudocolor density' },
  { id: 'pseudocolor-channel', label: 'Pseudocolor channel' },
  { id: 'dot', label: 'Dot' },
  { id: 'density', label: 'Density' },
  { id: 'contour', label: 'Contour' },
  { id: 'zebra', label: 'Zebra' },
  { id: 'histogram', label: 'Histogram' },
];

/** A plot type's name, as the menus show it. */
export function plotKindLabel(kind: PlotKind): string {
  return PLOT_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

/** Plot types whose color map is set on the Color axis card (Axis tab) instead of the Display card. */
export function hasColorAxis(kind: PlotKind): boolean {
  return kind === 'pseudocolor' || kind === 'pseudocolor-channel';
}
