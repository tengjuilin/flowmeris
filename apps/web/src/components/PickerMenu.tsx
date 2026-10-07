import type { Group, Sample } from '@flowmeris/model';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PickOption {
  value: string;
  label: string;
  /** Secondary text, e.g. a channel's marker name. */
  detail?: string;
  /** Heading the option is listed under; consecutive options share it. */
  group?: string;
  /** Indent level, e.g. a population's depth in the hierarchy. */
  depth?: number;
  swatch?: string;
}

/**
 * The element a picker opens next to. It is measured once the picker renders, so the picker lands in
 * the right place even when opening it moves the element (e.g. selecting a grid cell shows its controls).
 */
export type Anchor = Element;

/** Show a filter box once a list is longer than this. */
const FILTER_ABOVE = 8;

/**
 * A floating list to pick one value from, opened next to `anchor` (e.g. a clicked axis title).
 * Arrow keys move, Enter picks, Escape or a click elsewhere closes; typing filters long lists.
 */
export function PickerMenu({
  anchor,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  anchor: Anchor;
  title: string;
  options: PickOption[];
  value: string | undefined;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(q));
  }, [options, query]);
  const [cur, setCur] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const filter = options.length > FILTER_ABOVE;

  // Keep the highlight on a visible option while filtering.
  useEffect(() => {
    if (cur >= shown.length) setCur(Math.max(0, shown.length - 1));
  }, [shown, cur]);

  // Below the anchor and centred on it (above it when there is no room below); beside a vertical
  // anchor such as a y-axis title. Always inside the window.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const fit = (v: number, size: number, max: number) => Math.min(Math.max(8, v), max - size - 8);
    if (a.height > a.width) {
      const right = a.right + 4;
      const left = right + width > window.innerWidth - 8 ? a.left - width - 4 : right;
      setPos({
        left: fit(left, width, window.innerWidth),
        top: fit(a.top + a.height / 2 - height / 2, height, window.innerHeight),
      });
      return;
    }
    const below = a.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? a.top - height - 4 : below;
    setPos({
      left: fit(a.left + a.width / 2 - width / 2, width, window.innerWidth),
      top: fit(top, height, window.innerHeight),
    });
  }, [anchor]);

  useEffect(() => {
    if (!filter) box.current?.focus();
    const away = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      onClose();
      // Pressing the element that opened the picker closes it rather than opening it again.
      if (anchor.contains(e.target as Node)) e.stopPropagation();
    };
    const close = () => onClose();
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', close);
    };
  }, [onClose, filter, anchor]);

  useEffect(() => {
    box.current?.querySelector(`[data-i="${cur}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  const pick = (o: PickOption | undefined) => {
    if (!o) return;
    onClose();
    if (o.value !== value) onPick(o.value);
  };
  // Keys work wherever focus is while the menu is open (e.g. still on the clicked axis title), and
  // never reach the plot's or the app's own shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') setCur((i) => Math.min(shown.length - 1, i + 1));
      else if (e.key === 'ArrowUp') setCur((i) => Math.max(0, i - 1));
      else if (e.key === 'Enter') pick(shown[cur]);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  return createPortal(
    <dialog
      open
      ref={box}
      className="picker-menu"
      aria-label={title}
      tabIndex={-1}
      style={pos ? { left: pos.left, top: pos.top } : { opacity: 0, left: 0, top: 0 }}
    >
      <div className="picker-title">{title}</div>
      {filter && (
        <input
          type="search"
          autoFocus
          placeholder="Filter…"
          aria-label={`Filter ${title.toLowerCase()}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCur(0);
          }}
        />
      )}
      <div className="picker-list">
        {shown.length === 0 && <div className="muted small picker-empty">No matches</div>}
        {shown.map((o, i) => (
          <PickerItem
            key={o.value}
            option={o}
            index={i}
            heading={o.group !== undefined && o.group !== shown[i - 1]?.group ? o.group : undefined}
            selected={o.value === value}
            active={i === cur}
            onHover={() => setCur(i)}
            onPick={() => pick(o)}
          />
        ))}
      </div>
    </dialog>,
    document.body,
  );
}

function PickerItem({
  option: o,
  index,
  heading,
  selected,
  active,
  onHover,
  onPick,
}: {
  option: PickOption;
  index: number;
  heading: string | undefined;
  selected: boolean;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <>
      {heading && <div className="picker-group">{heading}</div>}
      <button
        type="button"
        tabIndex={-1}
        aria-current={selected || undefined}
        data-i={index}
        className={`picker-item${active ? ' active' : ''}${selected ? ' selected' : ''}`}
        style={o.depth ? { paddingLeft: 8 + o.depth * 14 } : undefined}
        onPointerMove={onHover}
        onClick={onPick}
      >
        {o.swatch && <span className="swatch" style={{ background: o.swatch }} />}
        <span className="picker-label">{o.label}</span>
        {o.detail && <span className="muted picker-detail">{o.detail}</span>}
      </button>
    </>
  );
}

/** Props that make an SVG text (an axis title) open a picker on click or Enter / Space. */
export function pickerTrigger(label: string, open: (anchor: Anchor) => void) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'aria-haspopup': 'dialog' as const,
    // Opens on press, not click: pressing may re-lay out the page (e.g. select a grid cell), and the
    // release would then miss the title. Also keeps the press from starting a gate on the plot.
    onPointerDown: (e: React.PointerEvent<Element>) => {
      e.stopPropagation();
      if (e.button === 0) open(e.currentTarget);
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent<Element>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      open(e.currentTarget);
    },
  };
}

/** A group's channels as picker options: the channel name, with its marker (\$PnS) alongside. */
export function channelOptions(group: Group, sample: Sample | undefined): PickOption[] {
  return group.channels.map((c) => {
    const pns = sample?.channels.find((x) => x.pnn === c)?.pns;
    return { value: c, label: c, ...(pns ? { detail: pns } : {}) };
  });
}
