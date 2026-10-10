import type { RidgeLayout } from '@flowmeris/model';
import { useEffect, useRef } from 'react';
import { InspectorTabs, PanelReset } from '../../components/ui/InspectorTabs.tsx';
import { useRowSelection } from '../../components/ui/ReorderList.tsx';
import { type RidgePanelTab, resetRidgePanel, ridgePanelAtDefaults } from '../../lib/ridgePanels.ts';
import { carryRidge } from '../../lib/ridgeStyle.ts';
import { usePanelState } from '../../state/prefs.ts';
import { useStore } from '../../state/store.ts';
import { type RidgeCard, type RidgeTabProps, ridgeEdits } from './ridgeEdits.ts';
import { AxisTab } from './tabs/AxisTab.tsx';
import { FigureTab } from './tabs/FigureTab.tsx';
import { SampleTab } from './tabs/SampleTab.tsx';
import { SettingsTab } from './tabs/SettingsTab.tsx';
import { TextTab } from './tabs/TextTab.tsx';
import { useRidge } from './useRidge.ts';

const RIDGE_TABS: { id: RidgePanelTab; label: string }[] = [
  { id: 'figure', label: 'Figure' },
  { id: 'sample', label: 'Sample' },
  { id: 'axis', label: 'Axis' },
  { id: 'text', label: 'Text' },
  { id: 'settings', label: 'Settings' },
];

/** The first section of each tab, and the Settings tab's cards, start open (the Sample tab has no sections). */
const DEFAULT_OPEN: Partial<Record<RidgeCard, boolean>> = {
  apply: true,
  resetAll: true,
  ridgeStyle: true,
  scale: true,
  labels: true,
  labelText: true,
};

const PANEL_KEY = 'flowmeris.ridgePanel';

/** The ridge plot settings panel. */
export function RidgeInspector() {
  const popId = useStore((s) => s.ui.popId);
  const r = useRidge();
  const { group, layout, rows, allIds } = r;
  const mutate = useStore((s) => s.mutate);
  // Kept here, not in the Sample tab, so the selection survives switching tabs.
  const selection = useRowSelection(rows.map((x) => x.id));
  // The last tab and open sections, remembered in this browser.
  const { tab, open, setTab, toggle } = usePanelState<RidgePanelTab, RidgeCard>(
    PANEL_KEY,
    RIDGE_TABS.map((t) => t.id),
    { tab: 'figure', open: DEFAULT_OPEN },
    { apply: true, resetAll: true },
  );
  // While settings are carried across populations, the population opened next takes the ridge settings
  // of the one left (keeping its own ticks and axis title).
  const last = useRef<{ groupId: string; popId: string; layoutId: string } | null>(null);
  useEffect(() => {
    if (!group || !layout) return;
    const prev = last.current;
    last.current = { groupId: group.id, popId, layoutId: layout.id };
    if (!prev || prev.groupId !== group.id || prev.popId === popId || !group.ridgeStyleFollow) return;
    const from = group.layouts.find((l): l is RidgeLayout => l.kind === 'ridge' && l.id === prev.layoutId);
    if (!from || !carryRidge(structuredClone(from), structuredClone(layout))) return;
    mutate('Carry ridge settings to population', (w) => {
      const ls = w.groups.find((x) => x.id === group.id)?.layouts;
      const src = ls?.find((l): l is RidgeLayout => l.kind === 'ridge' && l.id === prev.layoutId);
      const dst = ls?.find((l): l is RidgeLayout => l.kind === 'ridge' && l.id === layout.id);
      if (src && dst) carryRidge(src, dst);
    });
  }, [group?.id, popId, layout?.id]);
  if (!group) return null;

  // "Reset this panel": the open tab's settings for this ridge plot (the Sample tab: this group's rows).
  const current = new Set(allIds);
  const ws = useStore.getState().ws;
  const props: RidgeTabProps = {
    r,
    group,
    fx: ridgeEdits(r, group),
    card: (id) => ({ open: !!open[id], onToggle: () => toggle(id) }),
  };

  return (
    <aside className="inspector insp-panel" aria-label="Ridge plot settings">
      <div className="insp-head">
        <InspectorTabs
          idPrefix="ridge"
          label="Ridge plot settings"
          tabs={RIDGE_TABS}
          current={tab}
          onSelect={setTab}
        />
        <PanelReset
          title="Reset the settings in this panel for this ridge plot"
          disabled={ridgePanelAtDefaults(tab, layout, ws, group, current)}
          onClick={() =>
            r.update(`Reset ridge ${tab} settings`, (l, w, g) => resetRidgePanel(tab, l, w, g, current))
          }
        />
      </div>
      <div id="ridge-tabpanel" role="tabpanel" aria-labelledby={`ridge-tab-${tab}`}>
        {tab === 'settings' && <SettingsTab {...props} />}
        {tab === 'sample' && <SampleTab {...props} selection={selection} />}
        {tab === 'axis' && <AxisTab {...props} />}
        {tab === 'text' && <TextTab {...props} />}
        {tab === 'figure' && <FigureTab {...props} />}
      </div>
    </aside>
  );
}
