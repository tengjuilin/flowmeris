import type { ReactNode } from 'react';
import { ResetIcon } from './icons.tsx';

/** A collapsible group of settings, with its reset button at the top right; shared by the Gate and ridge settings. */
export function Section({
  id,
  title,
  open,
  onToggle,
  changed,
  onReset,
  actions,
  className,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Whether any setting in the section differs from its default; enables the reset button. */
  changed?: boolean;
  /** Leave out to show no reset button. */
  onReset?: () => void;
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
            title={changed ? `Reset ${title.toLowerCase()} to the defaults` : `${title} are at the defaults`}
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

export type Panel = { isOpen: (id: string) => boolean; toggle: (id: string) => void };
