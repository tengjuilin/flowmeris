import type { FieldSpec } from '../../lib/settings/index.ts';
import { NumInput } from '../ui/NumInput.tsx';
import { ResetIcon } from '../ui/icons.tsx';
import { FontSelect } from './FontSelect.tsx';

/**
 * One default setting of the Settings dialog: its control (number, color, font, checkbox or menu, from
 * the field's spec) and a reset button that puts it back on the factory default.
 */
export function DefaultField({
  field: f,
  value,
  atFactory,
  onChange,
  onReset,
}: {
  field: FieldSpec;
  /** Undefined: an optional color left to the theme. */
  value: unknown;
  atFactory: boolean;
  onChange: (v: unknown) => void;
  onReset: () => void;
}) {
  return (
    <div className="default-row">
      <FieldControl field={f} value={value} onChange={onChange} />
      <button
        type="button"
        className="icon reset-btn"
        disabled={atFactory}
        title={
          atFactory
            ? 'Already at the factory default'
            : `Reset ${f.label.toLowerCase()} to the factory default`
        }
        aria-label={`Reset ${f.label}`}
        onClick={onReset}
      >
        <ResetIcon />
      </button>
    </div>
  );
}

function FieldControl({
  field: f,
  value,
  onChange,
}: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  switch (f.kind) {
    case 'number':
      return (
        <NumInput
          label={f.label}
          title={f.title}
          value={value as number}
          step={f.step}
          onCommit={(v) => {
            const c = Math.min(f.max, Math.max(f.min, v));
            onChange(f.int ? Math.round(c) : c);
          }}
        />
      );
    case 'color':
      return (
        <label className="field">
          {f.label}
          <span className="default-color">
            {value === undefined && <span className="muted">{f.optional}</span>}
            <input
              type="color"
              className="swatch"
              aria-label={f.label}
              value={(value as string | undefined) ?? '#808080'}
              onChange={(e) => onChange(e.target.value)}
            />
          </span>
        </label>
      );
    case 'font':
      return <FontSelect label={f.label} value={value as string} onChange={(v) => v && onChange(v)} />;
    case 'bool':
      return (
        <label className="field check">
          <input type="checkbox" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
          {f.label}
        </label>
      );
    case 'select':
      return (
        <label className="field">
          {f.label}
          <select
            value={String(value)}
            onChange={(e) => onChange(f.options.find(([o]) => String(o) === e.target.value)?.[0])}
          >
            {f.options.map(([o, label]) => (
              <option key={String(o)} value={String(o)}>
                {label}
              </option>
            ))}
          </select>
        </label>
      );
  }
}
