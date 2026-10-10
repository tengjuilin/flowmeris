import type { StatPlot } from '@flowmeris/model';
import type { ChartCard } from '../../lib/panelSpecs.ts';
import type { CardOf } from '../../lib/settingsPanel.ts';
import type { ChartData } from './useChart.ts';

/** What every tab of the chart settings panel gets: the open chart, its data and edits, and its cards. */
export interface ChartTabProps {
  c: ChartData;
  plot: StatPlot;
  card: CardOf<ChartCard>;
}
