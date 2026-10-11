import { TicksEditor } from '../../../components/controls/TicksEditor.tsx';
import { ColorField } from '../../../components/ui/ColorField.tsx';
import { NumInput } from '../../../components/ui/NumInput.tsx';
import { Card } from '../../../components/ui/settings/index.ts';
import { withAxesChange } from '../../../lib/figure.ts';
import { clamp } from '../../../lib/math.ts';
import { AxisEditor } from '../AxisEditor.tsx';
import type { TabProps } from '../figureEdits.ts';

/** The Axis tab: swap X and Y, each axis (channel, scale, range, title), and ticks and spine. */
export function AxisTab({ plot, target, card, fx }: TabProps) {
  const { fig, edit, set, resetOf } = fx;
  const is2d = plot.kind !== 'histogram' && !!plot.y;
  const titleReset = (k: 'xTitle' | 'yTitle') => ({
    changed: fig[k] !== undefined,
    reset: () => fig[k] !== undefined && set(k, undefined, 'Reset axis title'),
  });
  const titleField = (k: 'xTitle' | 'yTitle', label: string) => (
    <label className="field short-text" title="Leave empty for the default; type a space for no title">
      Title
      <input
        type="text"
        aria-label={label}
        value={fig[k] ?? ''}
        placeholder="Marker :: channel"
        onChange={(e) => set(k, e.target.value || undefined, label, k)}
      />
    </label>
  );
  return (
    <>
      {is2d && (
        <div className="side-export swap-axes">
          <button
            type="button"
            title="Swap the X and Y axes"
            onClick={() =>
              edit('Swap axes', (f, p) => {
                if (!p.y) return;
                // Settings saved for the swapped pair come back as they were; otherwise swap the per-axis ones.
                if (withAxesChange(p, () => void ([p.x, p.y] = [p.y!, p.x]))) return;
                [f.xTicks, f.yTicks] = [f.yTicks, f.xTicks];
                [f.xTitle, f.yTitle] = [f.yTitle, f.xTitle];
                for (const k of ['xTicks', 'yTicks', 'xTitle', 'yTitle'] as const)
                  if (f[k] === undefined) delete f[k];
              })
            }
          >
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M2.5 5h10M10 2.5 12.5 5 10 7.5M13.5 11h-10M6 8.5 3.5 11 6 13.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Swap X and Y
          </button>
        </div>
      )}
      <AxisEditor target={target} which="x" plot={plot} card={card} extra={titleReset('xTitle')}>
        {titleField('xTitle', 'X axis title')}
      </AxisEditor>
      {is2d && (
        <AxisEditor target={target} which="y" plot={plot} card={card} extra={titleReset('yTitle')}>
          {titleField('yTitle', 'Y axis title')}
        </AxisEditor>
      )}
      <Card
        {...card(
          'ticks',
          resetOf(
            [
              'axisColor',
              'tickWidth',
              'spineColor',
              'spineWidth',
              'boxAspect',
              'showTickLabels',
              'xTicks',
              'yTicks',
            ],
            'ticks and spine',
          ),
        )}
      >
        <ColorField
          inline
          label="Tick color"
          inputLabel="Tick color"
          value={fig.axisColor ?? '#c8c8c8'}
          onChange={(v) => set('axisColor', v, 'Tick color', 'axisColor')}
          reset={{
            disabled: !fig.axisColor,
            label: "Reset tick color to the theme's",
            title: fig.axisColor ? "Reset tick color to the theme's" : 'Tick color is the default',
            onReset: () => set('axisColor', undefined, 'Tick color'),
          }}
        />
        <NumInput
          label="Tick width (px)"
          step={0.25}
          value={fig.tickWidth}
          onCommit={(v) => set('tickWidth', clamp(v, 0, 10), 'Tick width', 'tickWidth')}
        />
        <ColorField
          inline
          label="Spine color"
          inputLabel="Spine color"
          value={fig.spineColor ?? '#c8c8c8'}
          onChange={(v) => set('spineColor', v, 'Spine color', 'spineColor')}
          reset={{
            disabled: !fig.spineColor,
            label: "Reset spine color to the theme's",
            title: fig.spineColor ? "Reset spine color to the theme's" : 'Spine color is the default',
            onReset: () => set('spineColor', undefined, 'Spine color'),
          }}
        />
        <NumInput
          label="Spine width (px)"
          step={0.25}
          value={fig.spineWidth}
          onCommit={(v) => set('spineWidth', clamp(v, 0, 10), 'Spine width', 'spineWidth')}
        />
        <label className="field check">
          <input
            type="checkbox"
            checked={fig.boxAspect === undefined}
            onChange={(e) => set('boxAspect', e.target.checked ? undefined : 1, 'Box aspect ratio')}
          />
          Free box aspect ratio
        </label>
        {fig.boxAspect !== undefined && (
          <div className="sub-option">
            <NumInput
              label="Box width ÷ height"
              step={0.1}
              value={fig.boxAspect}
              onCommit={(v) => set('boxAspect', clamp(v, 0.2, 10), 'Box aspect ratio', 'boxAspect')}
            />
          </div>
        )}
        <label className="field check">
          <input
            type="checkbox"
            checked={fig.showTickLabels}
            onChange={(e) => set('showTickLabels', e.target.checked, 'Tick labels')}
          />
          Show tick labels
        </label>
        <div className="insp-pane-title">X axis</div>
        <TicksEditor ticks={fig.xTicks} onCommit={(t) => set('xTicks', t, 'X ticks')} />
        {is2d && (
          <>
            <div className="insp-pane-title">Y axis</div>
            <TicksEditor ticks={fig.yTicks} onCommit={(t) => set('yTicks', t, 'Y ticks')} />
          </>
        )}
      </Card>
    </>
  );
}
