import { useState } from 'react';
import { FONT_GROUPS, FONT_STACKS } from '../../lib/figure.ts';

const CUSTOM_FONT = '__custom';

/** A font picker: the app's font list, or the name of any font installed on this computer. */
export function FontSelect({
  label,
  value,
  onChange,
  inherit,
  bare,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  /** Offer "same as the figure" (value undefined), naming the figure's font. */
  inherit?: string;
  /** No visible caption: `label` becomes the select's accessible name. */
  bare?: boolean;
}) {
  const custom = value !== undefined && !(value in FONT_STACKS);
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text !== null) {
      const t = text.trim();
      if (t) onChange(t);
      setText(null);
    }
  };
  return (
    <>
      <label className={bare ? 'tt-font' : 'field'}>
        {!bare && label}
        <select
          aria-label={bare ? label : undefined}
          value={custom ? CUSTOM_FONT : (value ?? '')}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? undefined : v === CUSTOM_FONT ? 'Helvetica Neue' : v);
          }}
        >
          {inherit !== undefined && (
            <option value="">{bare ? inherit : `Same as figure (${inherit})`}</option>
          )}
          {FONT_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM_FONT}>Other installed font…</option>
        </select>
      </label>
      {custom && (
        <label
          className={bare ? 'field tt-wide' : 'field'}
          title="Used if the font is installed on the computer that views or exports the figure"
        >
          Font name
          <input
            type="text"
            value={text ?? value}
            placeholder="e.g. Futura"
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
      )}
    </>
  );
}
