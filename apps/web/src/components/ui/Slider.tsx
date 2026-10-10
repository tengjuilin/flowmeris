import { useState } from 'react';
import { clamp } from '../../lib/math.ts';

/** A 0–1 opacity slider shown as a percentage. */
export function Slider({
  label,
  value,
  onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      {label} · {Math.round(value * 100)}%
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** A slider for a 0–`max` fraction, with a percentage box beside it for typing an exact value. */
export function PercentSlider({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="field slider-field">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.05}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="unit-input">
        <input
          type="number"
          min={0}
          max={Math.round(max * 100)}
          step={5}
          aria-label={`${label} (%)`}
          value={text ?? String(Math.round(value * 100))}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(clamp(v / 100, 0, max));
          }}
          onBlur={() => setText(null)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        %
      </span>
    </div>
  );
}
