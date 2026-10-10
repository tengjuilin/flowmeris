import type { Group, PlotSpec } from '@flowmeris/model';
import { useEffect, useRef } from 'react';
import { EmptyPanel, SettingsPanel } from '../../components/ui/settings/index.ts';
import { carryToPopulation } from '../../lib/figure.ts';
import { gateMatchesAxes } from '../../lib/geometry.ts';
import { PLOT_PANELS } from '../../lib/panelSpecs.ts';
import { panelAtDefaults, resetPanel } from '../../lib/plotPanels.ts';
import { UNSAVED_PLOT_ID } from '../../lib/unsavedPlot.ts';
import { type PlotTarget, plotsOf as targetPlots } from '../../state/commands/plots.ts';
import { useSettingsPanel } from '../../state/prefs.ts';
import { useGroup, useStore } from '../../state/store.ts';
import { usePlotForPopulation, useTilePlot } from '../plot/index.ts';
import { GateEditor } from './GateEditor.tsx';
import { figureEdits } from './figureEdits.ts';
import { AxisTab } from './tabs/AxisTab.tsx';
import { FigureTab } from './tabs/FigureTab.tsx';
import { SettingsTab } from './tabs/SettingsTab.tsx';
import { TextTab } from './tabs/TextTab.tsx';

/**
 * The Gate view's settings: Figure / Axis / Text / Gate / Settings tabs of collapsible cards. With `target`
 * 'tiles' or 'grid', the same panel for the Tiles view or the Plot view's selected grid plot, editing only
 * those plots (never the Gate view's).
 */
export function Inspector({ target = 'gate' }: { target?: PlotTarget }) {
  const tiles = target === 'tiles';
  const grid = target === 'grid';
  const group = useGroup();
  const gatePlot = usePlotForPopulation();
  const tilePlot = useTilePlot(tiles ? group : undefined);
  const cellId = useStore((s) => s.ui.gridCellId);
  const gridPlot = grid ? group?.grid.cells.find((c) => c?.id === cellId) : undefined;
  const plot: PlotSpec | undefined = tiles ? tilePlot : grid ? (gridPlot ?? undefined) : gatePlot;
  /** The plots this panel edits: the group's Tiles plots, grid plots or Gate-view plots. */
  const plotsOf = (g: Group) => targetPlots(g, target);
  const follow = (g: Group) => (tiles ? g.tilePlotStyleFollow : g.plotStyleFollow);
  const mutate = useStore((s) => s.mutate);
  const spec = PLOT_PANELS[target];
  // The last tab and collapsed cards, remembered in this browser.
  const { tab, setTab, card } = useSettingsPanel(spec);
  // While settings are carried across populations, the population opened next takes the settings of
  // the one left (keeping its own title, ticks and axis titles). An unsaved plot takes them unsaved.
  const last = useRef<{ groupId: string; key: string; unsaved: PlotSpec | null } | null>(null);
  const key = plot && `${plot.id}|${plot.population}`;
  useEffect(() => {
    if (!group || !plot || !key) return;
    const prev = last.current;
    const unsaved = plot.id === UNSAVED_PLOT_ID;
    last.current = { groupId: group.id, key, unsaved: unsaved ? plot : null };
    if (grid || !prev || prev.groupId !== group.id || prev.key === key || !follow(group)) return;
    // The unsaved plot just saved by an edit is the same plot.
    if (prev.unsaved && !unsaved && prev.unsaved.population === plot.population) return;
    const fromId = prev.key.slice(0, prev.key.indexOf('|'));
    const from = prev.unsaved ?? plotsOf(group).find((p) => p.id === fromId);
    if (!from || !carryToPopulation(structuredClone(from), structuredClone(plot))) return;
    if (unsaved) {
      const carried = structuredClone(plot);
      carryToPopulation(structuredClone(from), carried);
      last.current.unsaved = carried;
      useStore.getState().setUi({ unsavedPlot: carried });
      return;
    }
    mutate('Carry settings to population', (w) => {
      const g = w.groups.find((x) => x.id === group.id);
      const src = prev.unsaved ?? (g && plotsOf(g).find((p) => p.id === fromId));
      const dst = g && plotsOf(g).find((p) => p.id === plot.id);
      if (src && dst) carryToPopulation(src, dst);
    });
  }, [group?.id, key]);
  if (!group || !plot)
    return (
      <EmptyPanel spec={spec}>
        {group &&
          (grid
            ? 'Select a plot in the grid to change its settings.'
            : 'Open a population to change its plot settings.')}
      </EmptyPanel>
    );
  const fx = figureEdits(group, plot, target);
  const is2d = plot.kind !== 'histogram' && !!plot.y;
  // The gates drawn on this plot (this population, on these axes), in the order they were made.
  const gates = Object.values(group.template.gates).filter(
    (g) => g.parentPop === plot.population && gateMatchesAxes(g, plot.x, is2d ? plot.y : undefined),
  );
  const tabProps = { group, plot, target, card, fx };

  return (
    <SettingsPanel
      spec={spec}
      tab={tab}
      onTab={setTab}
      reset={{
        disabled: panelAtDefaults(tab, plot, group, useStore.getState().ws, target === 'gate'),
        onReset: (label) =>
          mutate(label, (w) => {
            const g = w.groups.find((x) => x.id === group.id);
            const p = g && plotsOf(g).find((x) => x.id === plot.id);
            if (g && p) resetPanel(tab, p, g, w, target === 'gate');
          }),
      }}
    >
      {tab === 'settings' && <SettingsTab {...tabProps} />}
      {tab === 'gate' &&
        (gates.length ? (
          gates.map((g) => <GateEditor key={g.id} gateId={g.id} card={card} />)
        ) : (
          <p className="muted small">
            No gates on this plot yet. Draw one with the tools above the{' '}
            {tiles ? 'tiles' : grid ? 'grid' : 'plot'}.
          </p>
        ))}
      {tab === 'figure' && <FigureTab {...tabProps} gridPlot={gridPlot ?? undefined} />}
      {tab === 'axis' && <AxisTab {...tabProps} />}
      {tab === 'text' && <TextTab {...tabProps} />}
    </SettingsPanel>
  );
}
