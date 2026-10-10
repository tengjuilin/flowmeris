import { EmptyPanel, SettingsPanel } from '../../components/ui/settings/index.ts';
import {
  CHART_CARD_KEYS,
  chartCardAtDefaults,
  chartPanelAtDefaults,
  resetChartCard,
  resetChartPanel,
} from '../../lib/chartPanels.ts';
import { CHART_PANEL, type ChartCard } from '../../lib/panelSpecs.ts';
import { type CardOf, cardTitle } from '../../lib/settingsPanel.ts';
import { useSettingsPanel } from '../../state/prefs.ts';
import type { ChartTabProps } from './chartTabs.ts';
import { AxisTab } from './tabs/AxisTab.tsx';
import { FigureTab } from './tabs/FigureTab.tsx';
import { SettingsTab } from './tabs/SettingsTab.tsx';
import { TextTab } from './tabs/TextTab.tsx';
import { useChart } from './useChart.ts';

/** The Charts view's settings panel: Figure / Axis / Text / Settings tabs of collapsible cards. */
export function ChartInspector() {
  const c = useChart();
  const { plot, edit } = c;
  // The last tab and collapsed cards, remembered in this browser.
  const { tab, setTab, card: cardOf } = useSettingsPanel(CHART_PANEL);
  if (!c.group) return <EmptyPanel spec={CHART_PANEL} />;
  if (!plot) return <EmptyPanel spec={CHART_PANEL}>Add a chart to change its settings.</EmptyPanel>;

  // A card with settings of its own has a reset button.
  const card: CardOf<ChartCard> = (id, reset, title) =>
    cardOf(
      id,
      reset ??
        (CHART_CARD_KEYS[id] && {
          changed: !chartCardAtDefaults(plot, id),
          onReset: () =>
            edit(`Reset chart ${cardTitle(CHART_PANEL, id)?.toLowerCase()}`, (p) => resetChartCard(p, id)),
        }),
      title,
    );
  const props: ChartTabProps = { c, plot, card };

  return (
    <SettingsPanel
      spec={CHART_PANEL}
      tab={tab}
      onTab={setTab}
      reset={{
        disabled: chartPanelAtDefaults(tab, plot),
        onReset: (label) => edit(label, (p) => resetChartPanel(tab, p)),
      }}
    >
      {tab === 'figure' && <FigureTab {...props} />}
      {tab === 'axis' && <AxisTab {...props} />}
      {tab === 'text' && <TextTab {...props} />}
      {tab === 'settings' && <SettingsTab {...props} />}
    </SettingsPanel>
  );
}
