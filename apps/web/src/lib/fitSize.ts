/**
 * Plot sizes that fill a row are discrete: one per number of plots in the row. A view keeps the size
 * picked with its slider and, when its width changes, shows the number per row whose size is nearest it.
 */
export function nearestColumns(target: number, sizeFor: (columns: number) => number, min: number, max: number) {
  let best = min;
  for (let n = min + 1; n <= max; n++)
    if (Math.abs(sizeFor(n) - target) < Math.abs(sizeFor(best) - target)) best = n;
  return best;
}
