import type { Group } from '@flowmeris/model';
import { ActionRow } from '../../../components/ui/ActionRow.tsx';
import { Section } from '../../../components/ui/Section.tsx';
import { ApplyIcon, ResetIcon } from '../../../components/ui/icons.tsx';
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
import { type TabProps, cardProps } from '../figureEdits.ts';

/**
 * The Settings tab: apply this plot's settings to the others now, carry them to the plots opened next,
 * and reset settings across plots. A grid plot's tab applies to the grid's plots.
 */
export function SettingsTab({ group, plot, target, panel }: TabProps) {
  const mutate = useStore((s) => s.mutate);
  const tiles = target === 'tiles';
  /** The plots this panel edits: the group's Tiles plots, grid plots or Gate-view plots. */
  const plotsOf = (g: Group) => targetPlots(g, target);
  const follow = (g: Group) => (tiles ? g.tilePlotStyleFollow : g.plotStyleFollow);
  /** Defaults of the plots this panel edits: Tiles and grid plots start with smaller text. */
  const defStyle = target === 'gate' ? DEFAULT_STYLE : TILE_STYLE;
  if (target === 'grid')
    return (
      <>
        <Section id="apply" title="Apply settings" {...cardProps(panel, 'apply')}>
          <ActionRow
            label="Apply same settings for all grid plots"
            title="Give every plot in the grid this plot's settings now (each keeps its title, ticks and axis titles)"
            icon={<ApplyIcon />}
            disabled={populationsMatch(plotsOf(group), plot.id)}
            onClick={() =>
              mutate('Apply settings to all grid plots', (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                if (g) applyToPopulations(plotsOf(g), plot.id);
              })
            }
          />
          <label
            className="field check"
            title="On: a setting you change on a grid plot changes on every grid plot too; only that setting (each keeps its title, ticks and axis titles; an axis scale and range go to plots showing the same channel). Nothing changes when you tick it."
          >
            <input
              type="checkbox"
              checked={group.gridStyleFollow}
              onChange={(e) => {
                const on = e.target.checked;
                mutate(on ? 'Carry settings to all grid plots' : 'Settings per grid plot', (w) => {
                  const g = w.groups.find((x) => x.id === group.id);
                  if (g) g.gridStyleFollow = on;
                });
              }}
            />
            Carry settings to all grid plots
          </label>
        </Section>
        <Section id="resetAll" title="Reset settings" {...cardProps(panel, 'resetAll')}>
          <ActionRow
            label="All settings in this plot"
            title="Reset the settings of this grid plot"
            icon={<ResetIcon />}
            disabled={plotAtDefaults(plot, defStyle)}
            onClick={() =>
              mutate('Reset the settings of this grid plot', (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                const p = g && plotsOf(g).find((x) => x.id === plot.id);
                if (p) resetPlotStyles(p, defStyle);
              })
            }
          />
          <ActionRow
            label="All grid plots"
            title="Reset the settings of every plot in the grid"
            icon={<ResetIcon />}
            disabled={plotsOf(group).every((x) => plotAtDefaults(x, defStyle))}
            onClick={() =>
              mutate('Reset the settings of every grid plot', (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                if (g) for (const x of plotsOf(g)) resetPlotStyles(x, defStyle);
              })
            }
          />
        </Section>
      </>
    );
  return (
    <>
      <Section id="apply" title="Apply settings" {...cardProps(panel, 'apply')}>
        <ActionRow
          label="Apply same settings for all populations"
          title="Give every population's plot this plot's settings now (each keeps its title, ticks and axis titles)"
          icon={<ApplyIcon />}
          disabled={populationsMatch(plotsOf(group), plot.id)}
          onClick={() =>
            mutate('Apply settings to all populations', (w) => {
              const g = w.groups.find((x) => x.id === group.id);
              const p = g && plotsOf(g).find((x) => x.id === plot.id);
              if (g && p) applyToPopulations(plotsOf(g), p.id);
            })
          }
        />
        <ActionRow
          label="Apply same settings for all plots"
          title="Give every X/Y channel pair of this population these settings now"
          icon={<ApplyIcon />}
          disabled={pairsMatch(plot)}
          onClick={() =>
            mutate('Apply settings to all plots', (w) => {
              const g = w.groups.find((x) => x.id === group.id);
              const p = g && plotsOf(g).find((x) => x.id === plot.id);
              if (g && p) applyToPairs(p);
            })
          }
        />
        <label
          className="field check"
          title="On: the population you open next takes the settings of the one you leave (each keeps its title, ticks and axis titles). Nothing changes when you tick it."
        >
          <input
            type="checkbox"
            checked={follow(group)}
            onChange={(e) => {
              const on = e.target.checked;
              mutate(on ? 'Carry settings to populations' : 'Settings per population', (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                if (!g) return;
                if (tiles) g.tilePlotStyleFollow = on;
                else g.plotStyleFollow = on;
              });
            }}
          />
          Carry settings to next populations
        </label>
        <label
          className="field check"
          title="On: the X/Y channel pair you switch to next takes the settings in use. Off: each pair keeps its own. Nothing changes when you tick it."
        >
          <input
            type="checkbox"
            checked={plot.styleFollow !== false}
            onChange={(e) => {
              const on = e.target.checked;
              mutate(on ? 'Carry settings to plots' : 'Settings per channel pair', (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                const p = g && plotsOf(g).find((x) => x.id === plot.id);
                if (p) setPairStyles(p, !on);
              });
            }}
          />
          Carry settings to next plots
        </label>
      </Section>
      <Section id="resetAll" title="Reset settings" {...cardProps(panel, 'resetAll')}>
        <ActionRow
          label="All settings in this plot"
          title="Reset the settings of this plot (this population, these X/Y channels)"
          icon={<ResetIcon />}
          disabled={isDefaultStyle(plot.style, defStyle)}
          onClick={() =>
            mutate('Reset the settings of this plot', (w) => {
              const g = w.groups.find((x) => x.id === group.id);
              const p = g && plotsOf(g).find((x) => x.id === plot.id);
              if (g && p) resetCurrentStyle(p, defStyle);
            })
          }
        />
        <ActionRow
          label="All plots of this population"
          title="Reset the settings of every plot of this population"
          icon={<ResetIcon />}
          disabled={plotAtDefaults(plot, defStyle)}
          onClick={() =>
            mutate('Reset the settings of every plot of this population', (w) => {
              const g = w.groups.find((x) => x.id === group.id);
              const p = g && plotsOf(g).find((x) => x.id === plot.id);
              if (g && p) resetPlotStyles(p, defStyle);
            })
          }
        />
        <ActionRow
          label="All populations in this plot"
          title="Reset the settings of this X/Y channel pair in every population"
          icon={<ResetIcon />}
          disabled={pairAtDefaults(plotsOf(group), axesKey(plot), defStyle)}
          onClick={() =>
            mutate('Reset the settings of this X/Y channel pair in every population', (w) => {
              const g = w.groups.find((x) => x.id === group.id);
              const p = g && plotsOf(g).find((x) => x.id === plot.id);
              if (g && p) resetPairStyles(plotsOf(g), axesKey(p), defStyle);
            })
          }
        />
        <ActionRow
          label="All plots in all populations"
          title="Reset the settings of every plot in every population"
          icon={<ResetIcon />}
          disabled={plotsOf(group).every((x) => plotAtDefaults(x, defStyle))}
          onClick={() =>
            mutate('Reset the settings of every plot in every population', (w) => {
              const g = w.groups.find((x) => x.id === group.id);
              const p = g && plotsOf(g).find((x) => x.id === plot.id);
              if (g && p) for (const x of plotsOf(g)) resetPlotStyles(x, defStyle);
            })
          }
        />
      </Section>
    </>
  );
}
