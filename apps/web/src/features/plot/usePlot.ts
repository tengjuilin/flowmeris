import type { Group, PlotSpec } from '@flowmeris/model';
import { useEffect } from 'react';
import { newTilePlot } from '../../lib/plotFactories.ts';
import { useGroup, useStore } from '../../state/store.ts';

/** The Gate view's plot of the population being gated: the selected one (`ui.plotId`), else its first. */
export function usePlotForPopulation(): PlotSpec | undefined {
  const group = useGroup();
  const ui = useStore((s) => s.ui);
  if (!group) return undefined;
  return (
    group.plots.find((p) => p.id === ui.plotId && p.population === ui.popId) ??
    group.plots.find((p) => p.population === ui.popId)
  );
}

/** The Tiles plot of the population being gated; made from the Gate view's plot on first visit. */
export function useTilePlot(group: Group | undefined): PlotSpec | undefined {
  const popId = useStore((s) => s.ui.popId);
  const plot = group?.tilePlots.find((p) => p.population === popId);
  const missing = !!group && !plot && !!group.template.populations[popId];
  useEffect(() => {
    if (!missing || !group) return;
    useStore.getState().mutateQuiet((w) => {
      const g = w.groups.find((x) => x.id === group.id);
      if (g && !g.tilePlots.some((p) => p.population === popId)) newTilePlot(w, g, popId);
    });
  }, [missing, group, popId]);
  return plot;
}
