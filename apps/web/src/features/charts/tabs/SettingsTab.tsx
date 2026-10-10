import { ActionRow } from '../../../components/ui/ActionRow.tsx';
import { Section } from '../../../components/ui/Section.tsx';
import { ApplyIcon, DeleteIcon, DuplicateIcon, ResetIcon } from '../../../components/ui/icons.tsx';
import {
  applyChartToAll,
  chartAtDefaults,
  chartsMatch,
  duplicateChart,
  resetChart,
} from '../../../lib/chartPanels.ts';
import { addChart, removeChart } from '../../../state/commands/charts.ts';
import { mutateGroup } from '../../../state/store.ts';
import type { ChartTabProps } from '../chartTabs.ts';

/** The Settings tab: duplicate or delete the chart, apply its settings to the group's other charts, reset. */
export function SettingsTab({ c, plot, card }: ChartTabProps) {
  const group = c.group!;
  const plots = group.statPlots;
  return (
    <>
      <Section {...card('manage', 'Chart')}>
        <ActionRow
          label="Duplicate this chart"
          title="Add a copy of this chart, with its settings, as a new tab"
          icon={<DuplicateIcon />}
          disabled={false}
          onClick={() => addChart(group.id, duplicateChart(plot), 'Duplicate chart')}
        />
        <ActionRow
          label="Delete this chart"
          title="Delete this chart (Undo brings it back)"
          icon={<DeleteIcon />}
          disabled={false}
          onClick={() => removeChart(group.id, plot.id)}
        />
      </Section>
      <Section {...card('apply', 'Apply settings')}>
        <ActionRow
          label="Apply same settings for all charts"
          title="Give every chart of this group this chart's settings now (each keeps its axis titles; axis scales, ranges and ticks go to charts of the same column, series colours to charts coloured by the same variable)"
          icon={<ApplyIcon />}
          disabled={chartsMatch(plots, plot.id)}
          onClick={() =>
            mutateGroup(group.id, 'Apply chart settings to all charts', (g) =>
              applyChartToAll(g.statPlots, plot.id),
            )
          }
        />
      </Section>
      <Section {...card('resetAll', 'Reset settings')}>
        <ActionRow
          label="All settings in this chart"
          title="Reset the settings of this chart (its columns, type and hidden groups stay)"
          icon={<ResetIcon />}
          disabled={chartAtDefaults(plot)}
          onClick={() => c.edit('Reset the settings of this chart', (p) => resetChart(p))}
        />
        <ActionRow
          label="All charts"
          title="Reset the settings of every chart of this group"
          icon={<ResetIcon />}
          disabled={plots.every(chartAtDefaults)}
          onClick={() =>
            mutateGroup(group.id, 'Reset the settings of every chart', (g) => {
              for (const p of g.statPlots) resetChart(p);
            })
          }
        />
      </Section>
    </>
  );
}
