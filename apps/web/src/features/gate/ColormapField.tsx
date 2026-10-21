import { COLORMAPS } from '@flowmeris/render';

/** The color map picker: on the Color axis card of pseudocolor plots, on the Display card of density plots. */
export function ColormapField({ value, onChange }: { value: string; onChange: (colormap: string) => void }) {
  return (
    <label className="field">
      Color map
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {COLORMAPS.map((c) => (
          <option key={c} value={c}>
            {c === 'classic' ? 'classic (not perceptually uniform)' : c}
          </option>
        ))}
      </select>
    </label>
  );
}
