import type { ReactNode } from 'react';
import type { PanelSpec } from '../../../lib/settingsPanel.ts';
import { InspectorTabs, PanelReset } from './InspectorTabs.tsx';

/**
 * A settings panel: its tabs, the "Reset this panel" button, and the open tab's cards (`children`).
 * Every view's panel is drawn by this, so a change here changes them all.
 */
export function SettingsPanel<T extends string, C extends string>({
  spec,
  tab,
  onTab,
  disabledTabs,
  reset,
  head,
  className,
  children,
}: {
  spec: PanelSpec<T, C>;
  tab: T;
  onTab: (tab: T) => void;
  /** Tabs that cannot be opened now, with the reason shown on hover. */
  disabledTabs?: Partial<Record<T, string>>;
  /** "Reset this panel": whether the open tab is at its defaults, and how to reset it. */
  reset?: { disabled: boolean; onClick: () => void };
  /** More in the panel's head, below the tabs (a status line, buttons). */
  head?: ReactNode;
  /** A class for this panel's own CSS. */
  className?: string;
  children: ReactNode;
}) {
  const p = spec.idPrefix;
  const tabs = spec.tabs.map((t) => {
    const why = disabledTabs?.[t.id];
    return { id: t.id, label: t.label, ...(why !== undefined && { disabled: true, title: why }) };
  });
  return (
    <aside className={panelClass(className)} aria-label={spec.name}>
      <div className="insp-head">
        <InspectorTabs idPrefix={p} label={spec.name} tabs={tabs} current={tab} onSelect={onTab} />
        {reset && (
          <PanelReset
            title={`Reset the settings in this panel for this ${spec.noun}`}
            disabled={reset.disabled}
            onClick={reset.onClick}
          />
        )}
        {head}
      </div>
      <div id={`${p}-tabpanel`} role="tabpanel" aria-labelledby={`${p}-tab-${tab}`}>
        {children}
      </div>
    </aside>
  );
}

/** A settings panel with nothing to edit: `children` say what to do first. */
export function EmptyPanel<T extends string, C extends string>({
  spec,
  className,
  children,
}: { spec: PanelSpec<T, C>; className?: string; children?: ReactNode }) {
  return (
    <aside className={panelClass(className)} aria-label={spec.name}>
      {children}
    </aside>
  );
}

const panelClass = (className?: string) => `inspector insp-panel${className ? ` ${className}` : ''}`;
