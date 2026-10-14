import { useEffect, useRef, useState } from 'react';
import { SideTabs } from '../../components/ui/SideTabs.tsx';
import { DEFAULTS_TABS } from '../../lib/settings/index.ts';
import { readSession, writeSession } from '../../state/prefs.ts';
import { useSettings } from '../../state/settings.ts';
import { DefaultsTab } from './DefaultsTab.tsx';
import { HotkeysTab } from './HotkeysTab.tsx';
import { TransferTab } from './TransferTab.tsx';

const TABS = [
  ...DEFAULTS_TABS.map((t) => ({ id: t.id, label: t.title })),
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'transfer', label: 'Import and export' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const TAB_IDS = TABS.map((t) => t.id);
const TAB_KEY = 'flowmeris.settingsTab';

/**
 * The Settings dialog (header gear): the default appearance of plots, ridges and charts, the hotkeys,
 * and the settings file, on tabs down its side. Closing it draws the open view again if defaults changed.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<TabId>(() => readSession(TAB_KEY, TAB_IDS, 'plots'));
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const close = () => {
    dialog.current?.close();
    useSettings.getState().redrawViews();
    onClose();
  };
  const select = (t: TabId) => {
    setTab(t);
    writeSession(TAB_KEY, t);
  };
  const defaults = DEFAULTS_TABS.find((t) => t.id === tab);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(e) => {
        // Escape while a hotkey is being recorded is the key recorded.
        if (dialog.current?.querySelector('[data-recording]')) e.preventDefault();
        else {
          e.preventDefault();
          close();
        }
      }}
    >
      <header className="settings-head">
        <h2 id="settings-title">Settings</h2>
        <button type="button" className="icon settings-close" aria-label="Close" onClick={close}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <SideTabs idPrefix="settings" label="Settings" tabs={TABS} current={tab} onSelect={select}>
        <h3>{TABS.find((t) => t.id === tab)?.label}</h3>
        {defaults && <DefaultsTab key={defaults.id} tab={defaults} />}
        {tab === 'hotkeys' && <HotkeysTab />}
        {tab === 'transfer' && <TransferTab />}
      </SideTabs>
    </dialog>
  );
}
