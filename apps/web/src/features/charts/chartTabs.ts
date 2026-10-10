import type { StatPlot } from '@flowmeris/model';
import type { ChartCard } from '../../lib/chartPanels.ts';
import type { ChartData } from './useChart.ts';

/** `Section` props of a card of the chart settings panel: open state, and its reset when it has settings. */
export interface CardProps {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  changed?: boolean;
  onReset?: () => void;
}

/** What every tab of the chart settings panel gets: the open chart, its data and edits, and its cards. */
export interface ChartTabProps {
  c: ChartData;
  plot: StatPlot;
  card: (id: ChartCard, title: string) => CardProps;
}
