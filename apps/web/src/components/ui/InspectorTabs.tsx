import { ResetIcon } from './icons.tsx';

export interface InspectorTab<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

/**
 * The tab strip at the top of a settings panel. Tab `t` gets the id `${idPrefix}-tab-${t}` and controls
 * the element `${idPrefix}-tabpanel`, which the host renders with `aria-labelledby` set to the current tab.
 */
export function InspectorTabs<T extends string>({
  idPrefix,
  label,
  tabs,
  current,
  onSelect,
}: {
  idPrefix: string;
  /** Accessible name of the tab list. */
  label: string;
  tabs: readonly InspectorTab<T>[];
  current: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="tabs insp-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${t.id}`}
          aria-selected={current === t.id}
          aria-controls={`${idPrefix}-tabpanel`}
          className={current === t.id ? 'on' : ''}
          disabled={t.disabled}
          title={t.title}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** "Reset this panel": resets every setting on the current tab. */
export function PanelReset({
  title,
  disabled,
  onClick,
}: { title: string; disabled: boolean; onClick: () => void }) {
  return (
    <div className="insp-global">
      <span className="field">Reset this panel</span>
      <button
        type="button"
        className="icon reset-all"
        title={title}
        aria-label="Reset the settings in this panel"
        disabled={disabled}
        onClick={onClick}
      >
        <ResetIcon />
      </button>
    </div>
  );
}
