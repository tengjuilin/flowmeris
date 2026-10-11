import type { RidgeStyle, TextStyle } from '@flowmeris/model';
import { type CSSProperties, useState } from 'react';
import { fontLabel } from '../../lib/fonts/index.ts';
import { clamp } from '../../lib/math.ts';
import { ResetIcon } from '../ui/icons.tsx';
import { FontSelect } from './FontSelect.tsx';

const ALIGNS: { id: RidgeStyle['labelAlign']; name: string; lines: number[] }[] = [
  { id: 'start', name: 'Align left', lines: [0, 0, 0, 0] },
  { id: 'middle', name: 'Center', lines: [2, 0, 2, 0] },
  { id: 'end', name: 'Align right', lines: [4, 0, 4, 0] },
];

/** Four text lines, long and short alternating, aligned left, centered or right. */
function AlignIcon({ lines }: { lines: number[] }) {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
      {lines.map((x, i) => (
        <rect key={i} x={x} y={i * 3} width={i % 2 ? 14 : 10} height="1.5" fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * A word-processor style toolbar for one kind of text: font and size on one row, then
 * bold / italic / underline, color and (for ridge labels) alignment on the next.
 */
export function TextStyleEditor({
  label,
  value,
  base,
  baseColor,
  onChange,
  size,
  onSize,
  align,
  onAlign,
}: {
  label: string;
  value: TextStyle;
  base: string;
  baseColor: string;
  onChange: (t: TextStyle) => void;
  size: number;
  onSize: (v: number) => void;
  align?: RidgeStyle['labelAlign'];
  onAlign?: (a: RidgeStyle['labelAlign']) => void;
}) {
  const [sizeText, setSizeText] = useState<string | null>(null);
  const toggle = (k: 'bold' | 'italic' | 'underline', glyph: string, name: string, css: CSSProperties) => (
    <button
      type="button"
      className={value[k] ? 'on' : ''}
      aria-pressed={value[k]}
      title={name}
      aria-label={`${name} ${label.toLowerCase()}`}
      style={css}
      onClick={() => onChange({ ...value, [k]: !value[k] })}
    >
      {glyph}
    </button>
  );
  const ink = value.color ?? baseColor;
  return (
    <div className="text-toolbar">
      <div className="tt-row">
        <FontSelect
          bare
          label={`${label} font`}
          value={value.fontFamily}
          inherit={fontLabel(base)}
          onChange={(fontFamily) => onChange({ ...value, fontFamily })}
        />
        <input
          type="number"
          className="tt-size"
          step={0.5}
          title="Font size (px)"
          aria-label={`${label} size (px)`}
          value={sizeText ?? String(size)}
          onChange={(e) => {
            setSizeText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(v)) onSize(clamp(v, 4, 48));
          }}
          onBlur={() => setSizeText(null)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button
          type="button"
          className="tt-btn"
          title="Larger"
          aria-label={`Larger ${label.toLowerCase()}`}
          onClick={() => onSize(clamp(Math.floor(size) + 1, 4, 48))}
        >
          A<sup>+</sup>
        </button>
        <button
          type="button"
          className="tt-btn small-a"
          title="Smaller"
          aria-label={`Smaller ${label.toLowerCase()}`}
          onClick={() => onSize(clamp(Math.ceil(size) - 1, 4, 48))}
        >
          A<sup>−</sup>
        </button>
      </div>
      <div className="tt-row">
        <div className="seg">
          {toggle('bold', 'B', 'Bold', { fontWeight: 700 })}
          {toggle('italic', 'I', 'Italic', { fontStyle: 'italic', fontFamily: 'Georgia, serif' })}
          {toggle('underline', 'U', 'Underline', { textDecoration: 'underline' })}
        </div>
        <span className="tt-sep" aria-hidden="true" />
        <label className="tt-btn tt-color" title="Text color">
          <span style={{ color: ink }}>A</span>
          <span className="tt-bar" style={{ background: ink }} />
          <input
            type="color"
            aria-label={`${label} color`}
            value={ink}
            onChange={(e) => onChange({ ...value, color: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="reset-btn"
          title="Reset color to the base font color"
          aria-label={`Reset ${label.toLowerCase()} color`}
          disabled={!value.color}
          onClick={() => onChange({ ...value, color: undefined })}
        >
          <ResetIcon />
        </button>
        {align && onAlign && (
          <>
            <span className="tt-sep" aria-hidden="true" />
            <div className="seg">
              {ALIGNS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={align === x.id ? 'on' : ''}
                  aria-pressed={align === x.id}
                  title={x.name}
                  aria-label={x.name}
                  onClick={() => onAlign(x.id)}
                >
                  <AlignIcon lines={x.lines} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
