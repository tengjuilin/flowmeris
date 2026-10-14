import { type ReactNode, useEffect, useRef, useState } from 'react';

export interface HoverMenuItem {
  label: string;
  /** A small icon shown before the label. */
  icon?: ReactNode;
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
      // Firefox may report a leave while the pointer is still on the tab (when another menu's list is
      // removed), and nothing follows it, so the list closes only if the pointer really is away.
      onMouseLeave={() =>
        requestAnimationFrame(() => {
          if (!root.current?.matches(':hover')) setOpen(false);
        })
      }
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') return setOpen(false);
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        setOpen(true);
        // The tab and the items, in order; the arrows move along them without wrapping.
        const stops = [
          ...(root.current?.querySelectorAll<HTMLElement>(':scope > button, [role=menuitem]') ?? []),
        ];
        const at = stops.indexOf(document.activeElement as HTMLElement);
        stops[Math.min(stops.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        // The pointer may never have left (a pick removes the list under it), so no enter event follows.
        onMouseMove={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <div className="hover-menu-list" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              title={item.title}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span className="menu-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
