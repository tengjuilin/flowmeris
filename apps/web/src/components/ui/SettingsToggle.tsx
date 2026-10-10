import { SettingsIcon } from './icons.tsx';

/** The button at the end of a view's toolbar that shows or hides its settings panel. */
export function SettingsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="view-settings"
      aria-expanded={open}
      aria-label="Settings"
      title={open ? 'Hide settings' : 'Show settings'}
      onClick={onToggle}
    >
      <SettingsIcon />
    </button>
  );
}
