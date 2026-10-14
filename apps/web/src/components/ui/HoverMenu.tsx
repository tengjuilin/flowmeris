import { useEffect, useRef, useState } from 'react';

export interface HoverMenuItem {
  label: string;
  onSelect: () => void;
  /** Tooltip with the item's details. */
  title?: string;
}

/**
 * A header tab that lists commands in a dropdown. The list opens on hover or keyboard focus (and on a
 * click, for touch screens), and closes when the pointer or focus leaves, after a pick, or on Escape.
 */
export function HoverMenu({ label, items }: { label: string; items: HoverMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div
      ref={root}
      className="hover-menu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
        else if (e.key === 'ArrowDown' && !open) setOpen(true);
        else if (e.key === 'ArrowDown') first.current?.focus();
      }}
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className="hover-menu-list" role="menu" aria-label={label}>
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={i === 0 ? first : undefined}
              type="button"
              role="menuitem"
              title={item.title}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
