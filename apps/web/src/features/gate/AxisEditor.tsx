import type { AxisSpec, PlotSpec } from '@flowmeris/model';
import type { ReactNode } from 'react';
import { type ApplyAxis, AxisFields } from '../../components/controls/AxisFields.tsx';
import { type Panel, Section } from '../../components/ui/Section.tsx';
import { axisAtFactory, groupSample, resetAxisToFactory } from '../../lib/axisDefaults.ts';
import { type PlotTarget, axisChannelSetter, plotsOf, targetEdit } from '../../state/commands/plots.ts';
import { useGroup, useStore } from '../../state/store.ts';

/** An axis card: channel, scale and range, plus `children` (the axis title). */
export function AxisEditor({
  which,
  plot,
  panel,
  children,
  extra,
  target = 'gate',
}: {
  which: 'x' | 'y';
  plot: PlotSpec;
  panel: Panel;
  /** Which plots to edit; only a Gate-view plot's scales become the channel's defaults. */
  target?: PlotTarget;
  /** More settings for this axis, after the channel picker. */
  children?: ReactNode;
  /** Whether those settings differ from their defaults, and how to reset them with the axis. */
  extra?: { changed: boolean; reset: () => void };
}) {
  const ws = useStore((s) => s.ws);
  const group = useGroup()!;
  const mutate = useStore((s) => s.mutate);
  const apply: ApplyAxis = (label, fn, shared) =>
    mutate(label, (w) => {
      const g = w.groups.find((x) => x.id === group.id)!;
      const a = plotsOf(g, target).find((x) => x.id === plot.id)![which]!;
      fn(a, w, g);
      if (shared && target === 'gate') g.axisDefaults[a.channel] = { ...a };
    });
  const axis = plot[which] as AxisSpec;
  const sample = groupSample(ws, group);
  const id = `${which}axis`;
  const title = `${which.toUpperCase()} axis`;
  return (
    <Section
      id={id}
      title={title}
      open={panel.isOpen(id)}
      onToggle={() => panel.toggle(id)}
      changed={!!extra?.changed || !axisAtFactory(ws, group, axis)}
      onReset={() => {
        extra?.reset();
        apply(`Reset ${title}`, (a, w, g) => resetAxisToFactory(w, g, a), true);
      }}
    >
      <label className="field">
        Channel
        <select
          value={axis.channel}
          onChange={(e) =>
            axisChannelSetter(
              group,
              plot,
              target === 'gate' ? undefined : targetEdit(group.id, plot.id, target),
            )(which, e.target.value)
          }
        >
          {group.channels.map((c) => {
            const pns = sample?.channels.find((x) => x.pnn === c)?.pns;
            return (
              <option key={c} value={c}>
                {c}
                {pns ? ` (${pns})` : ''}
              </option>
            );
          })}
        </select>
      </label>
      <AxisFields hideReset axis={axis} population={plot.population} apply={apply} />
      {children}
    </Section>
  );
}
