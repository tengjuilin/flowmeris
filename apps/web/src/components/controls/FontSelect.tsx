import { useState } from 'react';
import { FONT_MENU, fontChoice, fontLabel } from '../../lib/fonts/index.ts';

const CUSTOM_FONT = '__custom';

/**
 * A font picker: the font menu (lib/fonts FONT_MENU), or the name of any font installed on this computer.
 * A saved font that is not in the menu is listed while it is chosen.
 */
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
  const choice = value === undefined ? undefined : fontChoice(value);
  const custom = value !== undefined && !choice;
  const ids = choice && !FONT_MENU.includes(choice.id) ? [...FONT_MENU, choice.id] : FONT_MENU;
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
          value={custom ? CUSTOM_FONT : (choice?.id ?? '')}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? undefined : v === CUSTOM_FONT ? 'Helvetica Neue' : v);
          }}
        >
          {inherit !== undefined && (
            <option value="">{bare ? inherit : `Same as figure (${inherit})`}</option>
          )}
          {ids.map((id) => (
            <option key={id} value={id}>
              {fontLabel(id)}
            </option>
          ))}
          <option value={CUSTOM_FONT}>Other installed font…</option>
        </select>
      </label>
      {custom && (
        <label className={bare ? 'field tt-wide' : 'field'}>
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
