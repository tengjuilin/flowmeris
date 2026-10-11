import { ResetIcon } from './icons.tsx';

/**
 * A labeled color swatch with a reset button (`swatch-auto`). `inline` lays it out as a
 * `<label class="field inline">`, otherwise as a `<div class="field">`.
 */
export function ColorField({
  label,
  value,
  onChange,
  inline = false,
  inputLabel,
  inputTitle,
  reset,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inline?: boolean;
  /** The swatch's own accessible name and tooltip. */
  inputLabel?: string;
  inputTitle?: string;
  reset: {
    disabled: boolean;
    /** Accessible name and tooltip of the reset button. */
    label: string;
    title: string;
    onReset: () => void;
    /** Styled as an icon button. */
    icon?: boolean;
  };
}) {
  const body = (
    <>
      {label}
      <span className="swatch-auto">
        <input
          type="color"
          className="swatch"
          aria-label={inputLabel}
          title={inputTitle}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className={reset.icon ? 'icon reset-btn' : 'reset-btn'}
          disabled={reset.disabled}
          title={reset.title}
          aria-label={reset.label}
          onClick={reset.onReset}
        >
          <ResetIcon />
        </button>
      </span>
    </>
  );
  return inline ? (
    // biome-ignore lint/a11y/noLabelWithoutControl: the color input is inside `body`
    <label className="field inline">{body}</label>
  ) : (
    <div className="field">{body}</div>
  );
}
