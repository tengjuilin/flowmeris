/**
 * Plot size slider whose stops are the sizes that fill a row with `min`..`max` plots (larger to the
 * right, so fewer per row). `onPick` gets the size of the stop picked.
 */
export function PlotSizeSlider({
  columns,
  min,
  max,
  sizeFor,
  onPick,
}: {
  columns: number;
  min: number;
  max: number;
  sizeFor: (columns: number) => number;
  onPick: (size: number) => void;
}) {
  return (
    <label className="field" title="Plot size: the plots are sized to fill each row">
      Plot size
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={min + max - columns}
        disabled={min >= max}
        onChange={(e) => onPick(sizeFor(min + max - Number(e.target.value)))}
      />
    </label>
  );
}
