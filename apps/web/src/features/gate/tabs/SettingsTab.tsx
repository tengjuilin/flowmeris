import type { Group, PlotSpec } from '@flowmeris/model';
import { ApplyCard, ResetCard } from '../../../components/ui/settings/index.ts';
import {
  DEFAULT_STYLE,
  TILE_STYLE,
  applyToPairs,
  applyToPopulations,
  axesKey,
  isDefaultStyle,
  pairAtDefaults,
  pairsMatch,
  plotAtDefaults,
  populationsMatch,
  resetCurrentStyle,
  resetPairStyles,
  resetPlotStyles,
  setPairStyles,
} from '../../../lib/figure.ts';
import { plotsOf as targetPlots } from '../../../state/commands/plots.ts';
import { useStore } from '../../../state/store.ts';
import type { TabProps } from '../figureEdits.ts';

/**
 * The Settings tab: apply this plot's settings to the others now, carry them to the plots opened next,
 * and reset settings across plots. A grid plot's tab applies to the grid's plots.
 */
export function SettingsTab({ group, plot, target, card }: TabProps) {
  const mutate = useStore((s) => s.mutate);
  const tiles = target === 'tiles';
  /** The plots this panel edits: the group's Tiles plots, grid plots or Gate-view plots. */
  const plotsOf = (g: Group) => targetPlots(g, target);
  const follow = (g: Group) => (tiles ? g.tilePlotStyleFollow : g.plotStyleFollow);
  /** Defaults of the plots this panel edits: Tiles and grid plots start with smaller text. */
  const defStyle = target === 'gate' ? DEFAULT_STYLE : TILE_STYLE;
  /** Edit this group and this plot (call inside `mutate`, as `fn(g, p)`). */
  const editPlot = (label: string, fn: (g: Group, p: PlotSpec) => void) =>
    mutate(label, (w) => {
      const g = w.groups.find((x) => x.id === group.id);
      const p = g && plotsOf(g).find((x) => x.id === plot.id);
      if (g && p) fn(g, p);
    });
  if (target === 'grid')
    return (
      <>
        <ApplyCard
          card={card('apply')}
          actions={[
            {
              label: 'Apply same settings for all grid plots',
              title:
                "Give every plot in the grid this plot's settings now (each keeps its title, ticks and axis titles)",
              disabled: populationsMatch(plotsOf(group), plot.id),
              run: () =>
                editPlot('Apply settings to all grid plots', (g) => applyToPopulations(plotsOf(g), plot.id)),
            },
          ]}
          checks={[
            {
              label: 'Carry settings to all grid plots',
              title:
                'On: a setting you change on a grid plot changes on every grid plot too; only that setting (each keeps its title, ticks and axis titles; an axis scale and range go to plots showing the same channel). Nothing changes when you tick it.',
              checked: group.gridStyleFollow,
              onChange: (on) =>
                mutate(on ? 'Carry settings to all grid plots' : 'Settings per grid plot', (w) => {
                  const g = w.groups.find((x) => x.id === group.id);
                  if (g) g.gridStyleFollow = on;
                }),
            },
          ]}
        />
        <ResetCard
          card={card('resetAll')}
          actions={[
            {
              label: 'All settings in this plot',
              title: 'Reset the settings of this grid plot',
              disabled: plotAtDefaults(plot, defStyle),
              run: () =>
                editPlot('Reset the settings of this grid plot', (_, p) => resetPlotStyles(p, defStyle)),
            },
            {
              label: 'All grid plots',
              title: 'Reset the settings of every plot in the grid',
              disabled: plotsOf(group).every((x) => plotAtDefaults(x, defStyle)),
              run: () =>
                mutate('Reset the settings of every grid plot', (w) => {
                  const g = w.groups.find((x) => x.id === group.id);
                  if (g) for (const x of plotsOf(g)) resetPlotStyles(x, defStyle);
                }),
            },
          ]}
        />
      </>
    );
  return (
    <>
      <ApplyCard
        card={card('apply')}
        actions={[
          {
            label: 'Apply same settings for all populations',
            title:
              "Give every population's plot this plot's settings now (each keeps its title, ticks and axis titles)",
            disabled: populationsMatch(plotsOf(group), plot.id),
            run: () =>
              editPlot('Apply settings to all populations', (g, p) => applyToPopulations(plotsOf(g), p.id)),
          },
          {
            label: 'Apply same settings for all plots',
            title: 'Give every X/Y channel pair of this population these settings now',
            disabled: pairsMatch(plot),
            run: () => editPlot('Apply settings to all plots', (_, p) => applyToPairs(p)),
          },
        ]}
        checks={[
          {
            label: 'Carry settings to next populations',
            title:
              'On: the population you open next takes the settings of the one you leave (each keeps its title, ticks and axis titles). Nothing changes when you tick it.',
            checked: follow(group),
            onChange: (on) =>
              mutate(on ? 'Carry settings to populations' : 'Settings per population', (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                if (!g) return;
                if (tiles) g.tilePlotStyleFollow = on;
                else g.plotStyleFollow = on;
              }),
          },
          {
            label: 'Carry settings to next plots',
            title:
              'On: the X/Y channel pair you switch to next takes the settings in use. Off: each pair keeps its own. Nothing changes when you tick it.',
            checked: plot.styleFollow !== false,
            onChange: (on) =>
              editPlot(on ? 'Carry settings to plots' : 'Settings per channel pair', (_, p) =>
                setPairStyles(p, !on),
              ),
          },
        ]}
      />
      <ResetCard
        card={card('resetAll')}
        actions={[
          {
            label: 'All settings in this plot',
            title: 'Reset the settings of this plot (this population, these X/Y channels)',
            disabled: isDefaultStyle(plot.style, defStyle),
            run: () => editPlot('Reset the settings of this plot', (_, p) => resetCurrentStyle(p, defStyle)),
          },
          {
            label: 'All plots of this population',
            title: 'Reset the settings of every plot of this population',
            disabled: plotAtDefaults(plot, defStyle),
            run: () =>
              editPlot('Reset the settings of every plot of this population', (_, p) =>
                resetPlotStyles(p, defStyle),
              ),
          },
          {
            label: 'All populations in this plot',
            title: 'Reset the settings of this X/Y channel pair in every population',
            disabled: pairAtDefaults(plotsOf(group), axesKey(plot), defStyle),
            run: () =>
              editPlot('Reset the settings of this X/Y channel pair in every population', (g, p) =>
                resetPairStyles(plotsOf(g), axesKey(p), defStyle),
              ),
          },
          {
            label: 'All plots in all populations',
            title: 'Reset the settings of every plot in every population',
            disabled: plotsOf(group).every((x) => plotAtDefaults(x, defStyle)),
            run: () =>
              editPlot('Reset the settings of every plot in every population', (g) => {
                for (const x of plotsOf(g)) resetPlotStyles(x, defStyle);
              }),
          },
        ]}
      />
    </>
  );
}
