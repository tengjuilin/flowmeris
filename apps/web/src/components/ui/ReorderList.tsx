import { type ReactNode, useRef, useState } from 'react';

/** Modifier keys of a click that selects a row. */
type SelectClick = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

/** Rows selected in a list of `ordered` ids: what ReorderList's `selection` takes. */
export interface RowSelection {
  selected: ReadonlySet<string>;
  /** Click selects one row; ⌘/Ctrl toggles; Shift extends from the last clicked row. */
  select: (id: string, e: SelectClick) => void;
  /** Select only `id`. */
  only: (id: string) => void;
  /** Rows an edit of row `id` applies to: the whole selection if `id` is part of it. */
  targets: (id: string) => string[];
}

export function useRowSelection(ordered: string[]): RowSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const select = (id: string, e: SelectClick) => {
    if (e.shiftKey && anchor.current && ordered.includes(anchor.current)) {
      const a = ordered.indexOf(anchor.current);
      const b = ordered.indexOf(id);
      setSelected(new Set(ordered.slice(Math.min(a, b), Math.max(a, b) + 1)));
      return;
    }
    anchor.current = id;
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected);
      if (!next.delete(id)) next.add(id);
      setSelected(next);
    } else setSelected(new Set([id]));
  };
  const only = (id: string) => {
    setSelected(new Set([id]));
    anchor.current = id;
  };
  const targets = (id: string) => (selected.has(id) ? ordered.filter((x) => selected.has(x)) : [id]);
  return { selected, select, only, targets };
}

/**
 * A list whose rows are reordered by dragging their grip (`reorder-list`). With `selection`, clicking a
 * row (outside its inputs and buttons) selects it, and dragging a selected row moves the whole selection.
 */
export function ReorderList({
  ids,
  name,
  gripTitle,
  onMove,
  selection,
  children,
}: {
  ids: string[];
  /** Row `id`'s name, for its grip's label. */
  name: (id: string) => string;
  gripTitle: string;
  /** Move `moved` (in list order) before `target`, or after it if `after`. */
  onMove: (moved: string[], target: string, after: boolean) => void;
  selection?: RowSelection;
  /** The row's controls, after its grip. */
  children: (id: string, index: number) => ReactNode;
}) {
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const sel = selection?.selected;
  return (
    <ol className="reorder-list" onDragLeave={() => setDrop(null)}>
      {ids.map((id, i) => {
        const isSel = !!sel?.has(id);
        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: row selection is a pointer convenience; every control inside stays keyboard-operable
          <li
            key={id}
            className={[
              isSel ? 'selected' : '',
              dragIds?.includes(id) ? 'dragging' : '',
              drop?.id === id ? (drop.after ? 'drop-after' : 'drop-before') : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={
              selection &&
              ((e) => {
                const t = e.target as HTMLElement;
                if (t.closest('input, button')) return;
                selection.select(id, e);
              })
            }
            onDragOver={(e) => {
              if (!dragIds) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const after = e.clientY > r.top + r.height / 2;
              if (drop?.id !== id || drop.after !== after) setDrop({ id, after });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIds && drop) onMove(dragIds, drop.id, drop.after);
              setDragIds(null);
              setDrop(null);
            }}
          >
            <span
              className="reorder-grip"
              draggable
              title={gripTitle}
              aria-label={`Drag ${name(id)} to reorder`}
              onDragStart={(e) => {
                const moved = isSel && sel ? ids.filter((x) => sel.has(x)) : [id];
                if (selection && !isSel) selection.only(id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', moved.join(','));
                const row = e.currentTarget.parentElement;
                if (row) e.dataTransfer.setDragImage(row, 8, 8);
                setDragIds(moved);
              }}
              onDragEnd={() => {
                setDragIds(null);
                setDrop(null);
              }}
            >
              ⠿
            </span>
            {children(id, i)}
          </li>
        );
      })}
    </ol>
  );
}
