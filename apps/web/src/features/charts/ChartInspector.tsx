import { InspectorTabs, PanelReset } from '../../components/ui/InspectorTabs.tsx';
import {
  CHART_CARD_KEYS,
  CHART_TAB_CARDS,
  type ChartCard,
  type ChartPanelTab,
  chartCardAtDefaults,
  chartPanelAtDefaults,
  resetChartCard,
  resetChartPanel,
} from '../../lib/chartPanels.ts';
import { usePanelState } from '../../state/prefs.ts';
import type { CardProps, ChartTabProps } from './chartTabs.ts';
import { AxisTab } from './tabs/AxisTab.tsx';
import { FigureTab } from './tabs/FigureTab.tsx';
import { SettingsTab } from './tabs/SettingsTab.tsx';
import { TextTab } from './tabs/TextTab.tsx';
import { useChart } from './useChart.ts';

const CHART_TABS: { id: ChartPanelTab; label: string }[] = [
  { id: 'figure', label: 'Figure' },
  { id: 'axis', label: 'Axis' },
  { id: 'text', label: 'Text' },
  { id: 'settings', label: 'Settings' },
];
const TAB_LABEL = Object.fromEntries(CHART_TABS.map((t) => [t.id, t.label.toLowerCase()]));

const PANEL_KEY = 'flowmeris.chartPanel';
/** Every card starts open; what the user collapses is remembered in this browser. */
const DEFAULT_OPEN: Partial<Record<ChartCard, boolean>> = Object.fromEntries(
  Object.values(CHART_TAB_CARDS)
    .flat()
    .map((c) => [c, true]),
);

/** The Charts view's settings panel: Figure / Axis / Text / Settings tabs of collapsible cards. */
export function ChartInspector() {
  const c = useChart();
  const { plot, edit } = c;
  const { tab, open, setTab, toggle } = usePanelState<ChartPanelTab, ChartCard>(
    PANEL_KEY,
    CHART_TABS.map((t) => t.id),
    { tab: 'figure', open: DEFAULT_OPEN },
    {},
  );
  if (!c.group) return null;
  if (!plot)
    return (
      <aside className="inspector insp-panel" aria-label="Chart settings">
        <p className="muted small">Add a chart to change its settings.</p>
      </aside>
    );

  const card = (id: ChartCard, title: string): CardProps => ({
    id: `chart-${id}`,
    title,
    open: !!open[id],
    onToggle: () => toggle(id),
    ...(CHART_CARD_KEYS[id] && {
      changed: !chartCardAtDefaults(plot, id),
      onReset: () => edit(`Reset chart ${title.toLowerCase()}`, (p) => resetChartCard(p, id)),
    }),
  });
  const props: ChartTabProps = { c, plot, card };

  return (
    <aside className="inspector insp-panel" aria-label="Chart settings">
      <div className="insp-head">
        <InspectorTabs
          idPrefix="chart"
          label="Chart settings"
          tabs={CHART_TABS}
          current={tab}
          onSelect={setTab}
        />
        <PanelReset
          title="Reset the settings in this panel for this chart"
          disabled={chartPanelAtDefaults(tab, plot)}
          onClick={() => edit(`Reset chart ${TAB_LABEL[tab]} settings`, (p) => resetChartPanel(tab, p))}
        />
      </div>
      <div id="chart-tabpanel" role="tabpanel" aria-labelledby={`chart-tab-${tab}`}>
        {tab === 'figure' && <FigureTab {...props} />}
        {tab === 'axis' && <AxisTab {...props} />}
        {tab === 'text' && <TextTab {...props} />}
        {tab === 'settings' && <SettingsTab {...props} />}
      </div>
    </aside>
  );
}
