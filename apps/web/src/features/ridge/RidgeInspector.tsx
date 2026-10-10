import type { RidgeLayout } from '@flowmeris/model';
import { useEffect, useRef } from 'react';
import { useRowSelection } from '../../components/ui/ReorderList.tsx';
import { SettingsPanel } from '../../components/ui/settings/index.ts';
import { RIDGE_PANEL } from '../../lib/panelSpecs.ts';
import { resetRidgePanel, ridgePanelAtDefaults } from '../../lib/ridgePanels.ts';
import { carryRidge } from '../../lib/ridgeStyle.ts';
import { useSettingsPanel } from '../../state/prefs.ts';
import { useStore } from '../../state/store.ts';
import { type RidgeTabProps, ridgeEdits } from './ridgeEdits.ts';
import { AxisTab } from './tabs/AxisTab.tsx';
import { FigureTab } from './tabs/FigureTab.tsx';
import { SampleTab } from './tabs/SampleTab.tsx';
import { SettingsTab } from './tabs/SettingsTab.tsx';
import { TextTab } from './tabs/TextTab.tsx';
import { useRidge } from './useRidge.ts';

/** The ridge plot settings panel. */
export function RidgeInspector() {
  const popId = useStore((s) => s.ui.popId);
  const r = useRidge();
  const { group, layout, rows, allIds } = r;
  const mutate = useStore((s) => s.mutate);
  // Kept here, not in the Sample tab, so the selection survives switching tabs.
  const selection = useRowSelection(rows.map((x) => x.id));
  // The last tab and collapsed cards, remembered in this browser.
  const { tab, setTab, card } = useSettingsPanel(RIDGE_PANEL);
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
    card,
  };

  return (
    <SettingsPanel
      spec={RIDGE_PANEL}
      tab={tab}
      onTab={setTab}
      reset={{
        disabled: ridgePanelAtDefaults(tab, layout, ws, group, current),
        onClick: () =>
          r.update(`Reset ridge ${tab} settings`, (l, w, g) => resetRidgePanel(tab, l, w, g, current)),
      }}
    >
      {tab === 'settings' && <SettingsTab {...props} />}
      {tab === 'sample' && <SampleTab {...props} selection={selection} />}
      {tab === 'axis' && <AxisTab {...props} />}
      {tab === 'text' && <TextTab {...props} />}
      {tab === 'figure' && <FigureTab {...props} />}
    </SettingsPanel>
  );
}
