import type { ColorStat } from '@flowmeris/model';
import { editPlot } from '../../../state/commands/plots.ts';
import { AxisEditor } from '../AxisEditor.tsx';
import type { TabProps } from '../figureEdits.ts';

/** What a pixel's color shows of the color channel's values of the events in it (M-PLOT-PSEUDO-CHANNEL). */
const STATS: { value: ColorStat; label: string }[] = [
  { value: 'median', label: 'Median' },
  { value: 'mean', label: 'Mean' },
  { value: 'max', label: 'Maximum' },
];

/**
 * The Color axis card of a Pseudocolor channel plot: the color channel, its scale and range, the statistic
 * of each pixel's events, the color bar and its title.
 */
export function ColorAxisCard({ group, plot, target, card, fx }: TabProps) {
  const { fig, set, resetOf } = fx;
  const barReset = resetOf(['colorBar', 'colorTitle'], 'color bar');
  const color = plot.color;
  if (!color) return null;
  const setStat = (stat: ColorStat) =>
    editPlot(
      group.id,
      plot.id,
      'Change color statistic',
      (p) => {
        if (p.color) p.color.stat = stat;
      },
      target,
    );
  const extraChanged = color.stat !== 'median' || barReset.changed;
  return (
    <AxisEditor
      target={target}
      which="color"
      plot={plot}
      card={card}
      extra={{
        changed: extraChanged,
        reset: () => {
          if (color.stat !== 'median') setStat('median');
          if (barReset.changed) barReset.onReset();
        },
      }}
    >
      <label
        className="field"
        title="What each point's color shows of the color channel's values of the events at that point"
      >
        Color by
        <select value={color.stat} onChange={(e) => setStat(e.target.value as ColorStat)}>
          {STATS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field check">
        <input
          type="checkbox"
          checked={fig.colorBar}
          onChange={(e) => set('colorBar', e.target.checked, 'Color bar')}
        />
        Show color bar
      </label>
      <label className="field short-text" title="Leave empty for the default; type a space for no title">
        Title
        <input
          type="text"
          aria-label="Color axis title"
          value={fig.colorTitle ?? ''}
          placeholder="Marker :: channel"
          onChange={(e) => set('colorTitle', e.target.value || undefined, 'Color axis title', 'colorTitle')}
        />
      </label>
    </AxisEditor>
  );
}
