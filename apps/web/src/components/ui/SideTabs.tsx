import type { ReactNode } from 'react';

/**
 * Tabs down the left side of a dialog, beside the current tab's pane (the Settings dialog). Up and down
 * arrows move between tabs. Tab `t` gets the id `${idPrefix}-tab-${t}`.
 */
export function SideTabs<T extends string>({
  idPrefix,
  label,
  tabs,
  current,
  onSelect,
  children,
}: {
  idPrefix: string;
  /** Accessible name of the tab list. */
  label: string;
  tabs: readonly { id: T; label: string }[];
  current: T;
  onSelect: (id: T) => void;
  /** The current tab's content. */
  children: ReactNode;
}) {
  const ids = tabs.map((t) => t.id);
  return (
    <div className="side-tabs">
      <div className="side-tabs-list" role="tablist" aria-label={label} aria-orientation="vertical">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={current === t.id}
            aria-controls={`${idPrefix}-tabpanel`}
            tabIndex={current === t.id ? 0 : -1}
            className={current === t.id ? 'on' : ''}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              const i = ids.indexOf(t.id) + (e.key === 'ArrowDown' ? 1 : -1);
              const next = ids[(i + ids.length) % ids.length]!;
              onSelect(next);
              document.getElementById(`${idPrefix}-tab-${next}`)?.focus();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <section
        id={`${idPrefix}-tabpanel`}
        role="tabpanel"
        className="side-tabs-pane"
        aria-labelledby={`${idPrefix}-tab-${current}`}
      >
        {children}
      </section>
    </div>
  );
}
