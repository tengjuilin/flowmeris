import { useState } from 'react';

/**
 * A labelled number field. Typing edits a draft; the value is committed on blur or Enter (or while
 * typing, with `live`), and text that is not a finite number is dropped.
 */
export function NumInput({
  value,
  onCommit,
  step,
  label,
  title,
  live,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  label: string;
  title?: string;
  /** Also commit while typing, so what the input drives updates live. */
  live?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="field" title={title}>
      {label}
      <input
        type="number"
        step={step ?? 'any'}
        value={text ?? String(Number(value.toPrecision(8)))}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (live && e.target.value.trim() !== '' && Number.isFinite(v)) onCommit(v);
        }}
        onBlur={() => {
          if (text !== null) {
            const v = Number(text);
            if (Number.isFinite(v)) onCommit(v);
            setText(null);
          }
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

/** A number that may be left empty (= automatic). */
export function OptNumInput({
  label,
  value,
  onCommit,
  title,
  disabled,
}: {
  label: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  title?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="field" title={title}>
      {label}
      <input
        type="number"
        step="any"
        placeholder="Auto"
        disabled={disabled}
        value={text ?? (value === undefined ? '' : String(Number(value.toPrecision(8))))}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === null) return;
          const v = text.trim() === '' ? undefined : Number(text);
          if (v === undefined || Number.isFinite(v)) onCommit(v);
          setText(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}
