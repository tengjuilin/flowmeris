import {
  type AxisSpec,
  type Group,
  type RidgeLayout,
  type RidgeStyle,
  type Workspace,
  newId,
} from '@flowmeris/model';
import { useCallback, useMemo } from 'react';
import { defaultChannels, factoryAxis } from '../../lib/axisDefaults.ts';
import { type RidgeRow, applyOrder, comboRows, selectRidges } from '../../lib/ridgeRows.ts';
import {
  DEFAULT_OVERLAP,
  DEFAULT_RIDGE_COMBINE,
  DEFAULT_RIDGE_STYLE,
  copyCombine,
} from '../../lib/ridgeStyle.ts';
import { useGroup, useSampleNames, useSelectedSampleIds, useStore } from '../../state/store.ts';

export type Ridge = ReturnType<typeof useRidge>;

/** The ridge layout of the current group and population, with defaults when none is saved yet. */
export function useRidge() {
  const popId = useStore((s) => s.ui.popId);
  const mutate = useStore((s) => s.mutate);
  const group = useGroup();
  const names = useSampleNames(group);
  const shown = useSelectedSampleIds(group);
  const layout = group?.layouts.find((l): l is RidgeLayout => l.kind === 'ridge' && l.population === popId);
  const style: RidgeStyle = layout?.style ?? DEFAULT_RIDGE_STYLE;
  // While following, the group's shared replicate settings apply to every population.
  const follow = group?.ridgeFollow ?? true;
  const combine =
    (follow ? group?.ridgeCombine : layout?.combine) ?? group?.ridgeCombine ?? DEFAULT_RIDGE_COMBINE;
  const ws = useStore((s) => s.ws);
  const overlap = layout?.overlap ?? DEFAULT_OVERLAP;
  const ch = layout?.axis.channel ?? (group ? defaultChannels(ws, group)[0] : '');

  // The ridge plot owns its axis (channel, scale and range): it is seeded from the channel's
  // built-in default when the layout is created and never follows the Gate view afterwards.
  const axis: AxisSpec | null = layout?.axis ?? null;

  // Ridges of the checked samples, in display order. `allIds` also covers unchecked samples, so a
  // reorder keeps the slots of ridges hidden by the sidebar selection. `groups` are the combined
  // ridges with all their replicates, including those hidden or excluded in the Replicates card.
  const { rows, allIds, groups } = useMemo(() => {
    if (!group) return { rows: [] as RidgeRow[], allIds: [] as string[], groups: [] as RidgeRow[] };
    const all: RidgeRow[] = combine.enabled
      ? comboRows(ws, group.sampleIds, combine.by)
      : group.sampleIds.map((id) => ({
          id,
          label: names[id] ?? ws.samples[id]?.fileName ?? id,
          sampleIds: [id],
        }));
    const allIds = applyOrder(
      all.map((r) => r.id),
      style.order,
    );
    const vis = new Set(shown);
    const inOrder = (rs: RidgeRow[]) => {
      const byId = new Map(rs.map((r) => [r.id, r]));
      return allIds.flatMap((id) => byId.get(id) ?? []);
    };
    if (!combine.enabled) return { rows: inOrder(all.filter((r) => vis.has(r.id))), allIds, groups: [] };
    const groups = inOrder(comboRows(ws, shown, combine.by));
    return { rows: selectRidges(groups, combine.hidden, combine.exclude), allIds, groups };
  }, [group, combine, style.order, shown, names, ws]);

  /** Edit the saved layout, creating it on first edit. Edits sharing `merge` coalesce into one undo step. */
  const update = useCallback(
    (label: string, fn: (l: RidgeLayout, w: Workspace, g: Group) => void, merge?: string) => {
      if (!group) return;
      mutate(
        label,
        (w) => {
          const g = w.groups.find((x) => x.id === group.id)!;
          const existing = g.layouts.find(
            (l): l is RidgeLayout => l.kind === 'ridge' && l.population === popId,
          );
          if (existing) return fn(existing, w, g);
          const l: RidgeLayout = {
            kind: 'ridge',
            id: newId('lay_'),
            population: popId,
            axis: factoryAxis(w, g, ch),
            overlap: DEFAULT_OVERLAP,
            norm: 'mode',
            style: structuredClone(DEFAULT_RIDGE_STYLE),
            combine: copyCombine(g.ridgeCombine),
          };
          fn(l, w, g);
          g.layouts.push(l);
        },
        merge && `ridge:${group.id}:${popId}:${merge}`,
      );
    },
    [group, popId, ch, mutate],
  );

  return {
    group,
    layout,
    style,
    combine,
    follow,
    overlap,
    ch,
    axis,
    rows,
    allIds,
    groups,
    update,
  };
}
