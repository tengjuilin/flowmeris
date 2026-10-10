import type { ReactNode } from 'react';

/** One row of a settings panel's Settings tab: a label, and an icon button that applies or resets. */
export function ActionRow({
  label,
  title,
  icon,
  disabled,
  onClick,
}: { label: string; title: string; icon: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <div className="field">
      {label}
      <button
        type="button"
        className="icon reset-btn"
        disabled={disabled}
        title={title}
        aria-label={title}
        onClick={onClick}
      >
        {icon}
      </button>
    </div>
  );
}
