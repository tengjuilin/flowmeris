import { AddIcon, CloseIcon } from './icons.tsx';

/**
 * A strip of closable tabs with a + button after them, for several plots of one kind (the Gate view's
 * reference plots, the Charts view's charts).
 */
export function TabStrip({
  label,
  tabs,
  current,
  onSelect,
  onClose,
  closeLabel,
  onAdd,
  addLabel,
  className,
}: {
  /** Accessible name of the tab list. */
  label: string;
  tabs: readonly { id: string; label: string }[];
  current: string | undefined;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** Title and accessible name of each tab's close button. */
  closeLabel: string;
  onAdd: () => void;
  /** Title and accessible name of the + button. */
  addLabel: string;
  className?: string;
}) {
  return (
    <div className={className ? `tab-strip ${className}` : 'tab-strip'} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <div key={t.id} className={`tab-strip-tab${t.id === current ? ' on' : ''}`}>
          <button
            type="button"
            role="tab"
            aria-selected={t.id === current}
            onClick={() => onSelect(t.id)}
            title={t.label}
          >
            {t.label}
          </button>
          <button
            type="button"
            className="icon"
            title={closeLabel}
            onClick={() => onClose(t.id)}
            aria-label={closeLabel}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="icon tab-strip-add"
        title={addLabel}
        onClick={onAdd}
        aria-label={addLabel}
      >
        <AddIcon />
      </button>
    </div>
  );
}
