import type { ReactNode } from 'react';
import type { CardProps } from '../../../lib/settingsPanel.ts';
import { ResetIcon } from '../icons.tsx';

/**
 * A card of a settings panel: a collapsible group of settings, with its reset button (or other `actions`)
 * at the top right. Its props usually come from `card(id)` of `useSettingsPanel`.
 */
export function Card({
  id,
  title,
  open,
  onToggle,
  changed,
  onReset,
  actions,
  className,
  children,
}: CardProps & {
  /** Buttons at the top right in place of the reset button. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`insp-section${open ? ' open' : ''}${className ? ` ${className}` : ''}`}>
      <div className="insp-section-bar">
        <button
          type="button"
          className="insp-section-head"
          aria-expanded={open}
          aria-controls={`insp-section-${id}`}
          onClick={onToggle}
        >
          <svg className="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.5 1.5 9 6l-5.5 4.5z" fill="currentColor" />
          </svg>
          {title}
        </button>
        {onReset && (
          <button
            type="button"
            className="icon reset-btn"
            disabled={!changed}
            title={changed ? `Reset ${title.toLowerCase()} to the defaults` : 'Already at the defaults'}
            aria-label={`Reset ${title.toLowerCase()}`}
            onClick={onReset}
          >
            <ResetIcon />
          </button>
        )}
        {actions}
      </div>
      {open && (
        <div id={`insp-section-${id}`} className="insp-section-body">
          {children}
        </div>
      )}
    </section>
  );
}
