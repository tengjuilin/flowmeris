/**
 * Plot sizes that fill a row are discrete: one per number of plots in the row. A view keeps the size
 * picked with its slider and, when its width changes, shows the number per row whose size is nearest it.
 */
export function nearestColumns(
  target: number,
  sizeFor: (columns: number) => number,
  min: number,
  max: number,
) {
  let best = min;
  for (let n = min + 1; n <= max; n++)
    if (Math.abs(sizeFor(n) - target) < Math.abs(sizeFor(best) - target)) best = n;
  return best;
}

/**
 * A row of equal plots filling a width (Tiles, Plot grid): `gap` px apart, each `pad` px wider than its
 * plot (padding and border), between `minColumns` and `maxColumns` per row and at least `minSize` wide.
 */
export interface RowFit {
  gap: number;
  pad: number;
  minSize: number;
  minColumns: number;
  maxColumns: number;
}

/** Plot size of `columns` plots, with the gaps between them, filling a row `width` wide. */
export function rowPlotSize(width: number, columns: number, f: RowFit): number {
  return Math.floor((width + f.gap) / columns) - f.gap - f.pad;
}

/** The most plots of at least `minSize` that fit a row `width` wide, within the column limits. */
export function rowMaxColumns(width: number, f: RowFit): number {
  const fit = Math.floor((width + f.gap) / (f.minSize + f.gap + f.pad));
  return Math.max(f.minColumns, Math.min(f.maxColumns, fit));
}

/**
 * Columns a card at least `sideWidth` wide spans among plots `size` wide, `columns` per row (the
 * populations card at the top right of the Tiles and Plot grid views).
 */
export function sideSpan(sideWidth: number, size: number, columns: number, f: RowFit): number {
  return Math.min(columns, Math.ceil((sideWidth + f.gap) / (size + f.gap + f.pad)));
}
