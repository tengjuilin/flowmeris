import { AxisFields } from '../../../components/controls/AxisFields.tsx';
import { TicksEditor } from '../../../components/controls/TicksEditor.tsx';
import { ColorField } from '../../../components/ui/ColorField.tsx';
import { Section } from '../../../components/ui/Section.tsx';
import { axisAtFactory, factoryAxis, resetAxisToFactory } from '../../../lib/axisDefaults.ts';
import { withRidgeChannel } from '../../../lib/ridgeStyle.ts';
import { useStore } from '../../../state/store.ts';
import type { RidgeTabProps } from '../ridgeEdits.ts';

/** The Axis tab: the channel, scale and range, ticks and axis title. */
export function AxisTab({ r, group, fx, card }: RidgeTabProps) {
  const { style, axis, update } = r;
  const { set, resetOf } = fx;
  const ws = useStore((s) => s.ws);
  const popId = useStore((s) => s.ui.popId);
  // The Scale card resets the axis to its channel's built-in scale and range.
  const axisReset = {
    changed: !!axis && !axisAtFactory(ws, group, axis),
    onReset: () => update('Reset axis', (l, w, g) => resetAxisToFactory(w, g, l.axis)),
  };
  return (
    <>
      <Section id="scale" {...axisReset} title="Scale and range" {...card('scale')}>
        {axis && (
          <label className="field">
            Channel
            <select
              value={axis.channel}
              onChange={(e) => {
                const c = e.target.value;
                update('Ridge channel', (l, w, g) => {
                  withRidgeChannel(l, () => {
                    l.axis = factoryAxis(w, g, c);
                  });
                });
              }}
            >
              {group.channels.map((c) => {
                const pns = ws.samples[group.sampleIds[0] ?? '']?.channels.find((x) => x.pnn === c)?.pns;
                return (
                  <option key={c} value={c}>
                    {c}
                    {pns ? ` (${pns})` : ''}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        {axis && (
          <AxisFields
            live
            hideReset
            axis={axis}
            population={popId}
            note="Applies to this ridge plot only."
            apply={(label, fn) => update(label, (l, w, g) => fn(l.axis, w, g), `axis:${label}`)}
          />
        )}
      </Section>
      <Section id="ticks" {...resetOf('ticks', 'ticks')} title="Ticks" {...card('ticks')}>
        <ColorField
          label="Axis color"
          inputLabel="Axis color"
          value={style.axisColor ?? '#9a9994'}
          onChange={(v) => set('axisColor', v, 'Ridge axis color', 'axisColor')}
          reset={{
            icon: true,
            disabled: style.axisColor === undefined,
            label: 'Reset axis color',
            title: 'Reset the axis color',
            onReset: () => set('axisColor', undefined, 'Ridge axis color'),
          }}
        />
        <ColorField
          label="Baseline color"
          inputLabel="Baseline color"
          value={style.baselineColor ?? '#d8d7d1'}
          onChange={(v) => set('baselineColor', v, 'Ridge baseline color', 'baselineColor')}
          reset={{
            icon: true,
            disabled: style.baselineColor === undefined,
            label: 'Reset baseline color',
            title: 'Reset the baseline color',
            onReset: () => set('baselineColor', undefined, 'Ridge baseline color'),
          }}
        />
        <label className="field check">
          <input
            type="checkbox"
            checked={style.showTickLabels}
            onChange={(e) => set('showTickLabels', e.target.checked, 'Ridge tick labels')}
          />
          Show tick labels
        </label>
        <TicksEditor ticks={style.ticks} onCommit={(t) => set('ticks', t, 'Ridge ticks')} />
      </Section>
      <Section id="title" {...resetOf('title', 'title')} title="Title" {...card('title')}>
        <label className="field" title="Leave empty for the default; type a space for no title">
          Axis title
          <input
            type="text"
            value={style.axisTitle ?? ''}
            placeholder="Marker :: channel"
            onChange={(e) => set('axisTitle', e.target.value || undefined, 'Ridge axis title', 'title')}
          />
        </label>
      </Section>
    </>
  );
}
