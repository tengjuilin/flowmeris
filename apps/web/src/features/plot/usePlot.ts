import type { Group, PlotSpec } from '@flowmeris/model';
import { useEffect, useMemo } from 'react';
import { newTilePlot } from '../../lib/plotFactories.ts';
import { gateViewPlot } from '../../lib/unsavedPlot.ts';
import { useGroup, useStore } from '../../state/store.ts';

/**
 * The Gate view's plot of the population being gated (lib/unsavedPlot.ts `gateViewPlot`): the selected
 * one (`ui.plotId`), else its first, else a plot shown unsaved until it is edited.
 */
export function usePlotForPopulation(): PlotSpec | undefined {
  const group = useGroup();
  const ws = useStore((s) => s.ws);
  const popId = useStore((s) => s.ui.popId);
  const plotId = useStore((s) => s.ui.plotId);
  const unsavedPlot = useStore((s) => s.ui.unsavedPlot);
  const shown = useMemo(
    () => (group ? gateViewPlot(ws, group, { popId, plotId, unsavedPlot }) : undefined),
    [ws, group, popId, plotId, unsavedPlot],
  );
  // The transforms and axis defaults an unsaved plot's axes need, registered so they can be drawn.
  const registers = !!shown && shown.ws !== ws;
  useEffect(() => {
    if (!registers || !shown) return;
    useStore.getState().mutateQuiet((w) => {
      for (const [id, t] of Object.entries(shown.ws.transforms)) w.transforms[id] ??= structuredClone(t);
      const from = shown.ws.groups.find((x) => x.id === group?.id);
      const to = w.groups.find((x) => x.id === group?.id);
      if (from && to)
        for (const [ch, a] of Object.entries(from.axisDefaults)) to.axisDefaults[ch] ??= { ...a };
    });
  }, [registers, shown, group?.id]);
  return shown?.plot;
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
