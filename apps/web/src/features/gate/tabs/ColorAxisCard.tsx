import type { ColorStat } from '@flowmeris/model';
import { TicksEditor } from '../../../components/controls/TicksEditor.tsx';
import { NumInput } from '../../../components/ui/NumInput.tsx';
import { Card } from '../../../components/ui/settings/index.ts';
import { DEFAULT_STYLE, TILE_STYLE } from '../../../lib/figure.ts';
import { clamp } from '../../../lib/math.ts';
import { editPlot } from '../../../state/commands/plots.ts';
import { AxisEditor } from '../AxisEditor.tsx';
import { ColormapField } from '../ColormapField.tsx';
import type { TabProps } from '../figureEdits.ts';

/** What a pixel's color shows of the color channel's values of the events in it (M-PLOT-PSEUDO-CHANNEL). */
const STATS: { value: ColorStat; label: string }[] = [
  { value: 'median', label: 'Median' },
  { value: 'mean', label: 'Mean' },
  { value: 'max', label: 'Maximum' },
];

/** The color bar's settings, reset with the card. */
const BAR_KEYS = ['colorBar', 'colorTitle', 'colorBarWidth', 'colorBarLength', 'colorTicks'] as const;

/**
 * The Color axis card of a pseudocolor plot. A Pseudocolor channel plot's: the color channel, its scale
 * and range, the color map, the statistic of each pixel's events, and the color bar (size, title, ticks).
 * A Pseudocolor density plot's, which has no color channel: the color map.
 */
export function ColorAxisCard(props: TabProps) {
  const { group, plot, target, card, fx } = props;
  const { fig, set, resetOf } = fx;
  const barReset = resetOf(BAR_KEYS, 'color bar');
  const defaultMap = (target === 'gate' ? DEFAULT_STYLE : TILE_STYLE).colormap;
  const edit = (label: string, fn: (p: typeof plot) => void) =>
    editPlot(group.id, plot.id, label, fn, target);
  const setColormap = (c: string) => edit('Change color map', (p) => void (p.style.colormap = c));
  const colormap = <ColormapField value={plot.style.colormap} onChange={setColormap} />;
  const color = plot.color;
  if (plot.kind !== 'pseudocolor-channel' || !color)
    return (
      <Card
        {...card('caxis', {
          changed: plot.style.colormap !== defaultMap,
          onReset: () => setColormap(defaultMap),
        })}
      >
        {colormap}
      </Card>
    );
  const setStat = (stat: ColorStat) =>
    edit('Change color statistic', (p) => p.color && (p.color.stat = stat));
  return (
    <AxisEditor
      target={target}
      which="color"
      plot={plot}
      card={card}
      extra={{
        changed: color.stat !== 'median' || plot.style.colormap !== defaultMap || barReset.changed,
        reset: () => {
          if (color.stat !== 'median' || plot.style.colormap !== defaultMap)
            edit('Reset color axis', (p) => {
              p.style.colormap = defaultMap;
              if (p.color) p.color.stat = 'median';
            });
          if (barReset.changed) barReset.onReset();
        },
      }}
    >
      {colormap}
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
      {fig.colorBar && (
        <div className="sub-option">
          <NumInput
            label="Bar width (px)"
            step={1}
            value={fig.colorBarWidth}
            onCommit={(v) => set('colorBarWidth', clamp(v, 2, 60), 'Color bar width', 'colorBarWidth')}
          />
          <NumInput
            label="Bar length (%)"
            step={5}
            value={fig.colorBarLength}
            onCommit={(v) => set('colorBarLength', clamp(v, 10, 100), 'Color bar length', 'colorBarLength')}
            title="The color bar's length in % of the plot's height, centered on it"
          />
          <label className="field short-text" title="Leave empty for the default; type a space for no title">
            Title
            <input
              type="text"
              aria-label="Color axis title"
              value={fig.colorTitle ?? ''}
              placeholder="Marker :: channel"
              onChange={(e) =>
                set('colorTitle', e.target.value || undefined, 'Color axis title', 'colorTitle')
              }
            />
          </label>
          <TicksEditor ticks={fig.colorTicks} onCommit={(t) => set('colorTicks', t, 'Color bar ticks')} />
        </div>
      )}
    </AxisEditor>
  );
}
