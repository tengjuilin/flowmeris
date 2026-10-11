import { useState } from 'react';

/**
 * A labelled number field. Each finite number typed is committed at once, so what the field drives
 * updates while typing (with `live={false}`, only on blur or Enter). An empty field, or text that is not a
 * finite number (the browser empties a number field holding text), commits nothing and shows the value
 * from before the edit again on blur; that value is committed again if typing changed it.
 */
export function NumInput({
  value,
  onCommit,
  step,
  label,
  title,
  live = true,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  label: string;
  title?: string;
  /** Commit while typing (the default), so what the input drives updates live. */
  live?: boolean;
}) {
  // The text being typed, and the value when typing started.
  const [draft, setDraft] = useState<{ text: string; start: number } | null>(null);
  const parse = (text: string) => (text.trim() === '' ? Number.NaN : Number(text));
  return (
    <label className="field" title={title}>
      {label}
      <input
        type="number"
        step={step ?? 'any'}
        value={draft?.text ?? String(Number(value.toPrecision(8)))}
        onChange={(e) => {
          setDraft({ text: e.target.value, start: draft?.start ?? value });
          const v = parse(e.target.value);
          if (live && Number.isFinite(v)) onCommit(v);
        }}
        onBlur={() => {
          if (draft === null) return;
          const v = parse(draft.text);
          if (Number.isFinite(v)) onCommit(v);
          else if (live && value !== draft.start) onCommit(draft.start);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

/**
 * A number that may be left empty (= automatic). Like `NumInput`, each finite number typed is committed at
 * once; emptying the field commits `undefined` on blur or Enter.
 */
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
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(v)) onCommit(v);
        }}
        onBlur={() => {
          if (text === null) return;
          const v = text.trim() === '' ? undefined : Number(text);
          if (v === undefined ? value !== undefined : Number.isFinite(v) && v !== value) onCommit(v);
          setText(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}
