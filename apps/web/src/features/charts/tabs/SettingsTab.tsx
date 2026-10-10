import { DeleteIcon, DuplicateIcon } from '../../../components/ui/icons.tsx';
import { ActionsCard, ApplyCard, ResetCard } from '../../../components/ui/settings/index.ts';
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
      <ActionsCard
        card={card('manage')}
        actions={[
          {
            label: 'Duplicate this chart',
            title: 'Add a copy of this chart, with its settings, as a new tab',
            icon: <DuplicateIcon />,
            run: () => addChart(group.id, duplicateChart(plot), 'Duplicate chart'),
          },
          {
            label: 'Delete this chart',
            title: 'Delete this chart (Undo brings it back)',
            icon: <DeleteIcon />,
            run: () => removeChart(group.id, plot.id),
          },
        ]}
      />
      <ApplyCard
        card={card('apply')}
        actions={[
          {
            label: 'Apply same settings for all charts',
            title:
              "Give every chart of this group this chart's settings now (each keeps its axis titles; axis scales, ranges and ticks go to charts of the same column, series colours to charts coloured by the same variable)",
            disabled: chartsMatch(plots, plot.id),
            run: () =>
              mutateGroup(group.id, 'Apply chart settings to all charts', (g) =>
                applyChartToAll(g.statPlots, plot.id),
              ),
          },
        ]}
      />
      <ResetCard
        card={card('resetAll')}
        actions={[
          {
            label: 'All settings in this chart',
            title: 'Reset the settings of this chart (its columns, type and hidden groups stay)',
            disabled: chartAtDefaults(plot),
            run: () => c.edit('Reset the settings of this chart', (p) => resetChart(p)),
          },
          {
            label: 'All charts',
            title: 'Reset the settings of every chart of this group',
            disabled: plots.every(chartAtDefaults),
            run: () =>
              mutateGroup(group.id, 'Reset the settings of every chart', (g) => {
                for (const p of g.statPlots) resetChart(p);
              }),
          },
        ]}
      />
    </>
  );
}
