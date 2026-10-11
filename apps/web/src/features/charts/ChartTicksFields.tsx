import { ColorField } from '../../components/ui/ColorField.tsx';
import { NumInput } from '../../components/ui/NumInput.tsx';
import { clamp } from '../../lib/math.ts';
import type { ChartData } from './useChart.ts';

/** Shown in a swatch when the tick or spine colour is unset (the theme's). */
const THEME_LINE = '#c8c8c8';

/** The chart's tick marks and axis lines (spines), and the plot area's aspect ratio, as in the Gate view. */
export function ChartTicksFields({ c }: { c: ChartData }) {
  const { set } = c;
  const st = c.plot!.style;
  return (
    <>
      <ColorField
        inline
        label="Tick colour"
        inputLabel="Tick colour"
        value={st.tickColor ?? THEME_LINE}
        onChange={(v) => set('tickColor', v, 'Chart tick colour')}
        reset={{
          disabled: !st.tickColor,
          label: "Reset tick colour to the theme's",
          title: st.tickColor ? "Reset tick colour to the theme's" : 'Tick colour is the default',
          onReset: () => set('tickColor', undefined, 'Chart tick colour'),
        }}
      />
      <NumInput
        label="Tick width (px)"
        step={0.25}
        value={st.tickWidth}
        onCommit={(v) => set('tickWidth', clamp(v, 0, 10), 'Chart tick width')}
      />
      <ColorField
        inline
        label="Spine colour"
        inputLabel="Spine colour"
        value={st.spineColor ?? THEME_LINE}
        onChange={(v) => set('spineColor', v, 'Chart spine colour')}
        reset={{
          disabled: !st.spineColor,
          label: "Reset spine colour to the theme's",
          title: st.spineColor ? "Reset spine colour to the theme's" : 'Spine colour is the default',
          onReset: () => set('spineColor', undefined, 'Chart spine colour'),
        }}
      />
      <NumInput
        label="Spine width (px)"
        step={0.25}
        value={st.spineWidth}
        onCommit={(v) => set('spineWidth', clamp(v, 0, 10), 'Chart spine width')}
      />
      <label className="field check">
        <input
          type="checkbox"
          checked={st.boxAspect === undefined}
          onChange={(e) => set('boxAspect', e.target.checked ? undefined : 1, 'Chart box aspect ratio')}
        />
        Free box aspect ratio
      </label>
      {st.boxAspect !== undefined && (
        <div className="sub-option">
          <NumInput
            label="Box width ÷ height"
            step={0.1}
            title="The plot area's shape, fitted inside the chart's width and height"
            value={st.boxAspect}
            onCommit={(v) => set('boxAspect', clamp(v, 0.2, 10), 'Chart box aspect ratio')}
          />
        </div>
      )}
    </>
  );
}
