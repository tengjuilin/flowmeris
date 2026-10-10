import type { Variable } from '@flowmeris/model';
import { useState } from 'react';
import { distinctValues, retype } from '../../lib/metadata.ts';
import { toast, useStore } from '../../state/store.ts';

/** Category order of a categorical variable, reordered by dragging (or Alt+↑/↓ on a focused item). */
function LevelOrder({ v, levels }: { v: Variable; levels: string[] }) {
  const mutate = useStore((s) => s.mutate);
  // `slot`: where the dragged item would go, as an index between the items (0…levels.length).
  const [drag, setDrag] = useState<{ from: number; slot: number } | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= levels.length) return;
    mutate('Reorder categories', (w) => {
      const order = [...levels];
      const [item] = order.splice(from, 1);
      order.splice(to, 0, item!);
      w.variables.find((x) => x.id === v.id)!.levels = order;
    });
  };

  return (
    <ol className="level-list">
      {levels.map((l, i) => (
        <li
          key={l}
          draggable
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable to reorder with Alt+↑/↓.
          tabIndex={0}
          title="Drag, or Alt+↑/↓, to reorder"
          className={[
            drag?.from === i ? 'dragging' : '',
            drag && drag.slot === i ? 'drop-before' : '',
            drag && drag.slot === levels.length && i === levels.length - 1 ? 'drop-after' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', l);
            e.dataTransfer.effectAllowed = 'move';
            setDrag({ from: i, slot: i });
          }}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            const b = e.currentTarget.getBoundingClientRect();
            const slot = e.clientY < b.top + b.height / 2 ? i : i + 1;
            if (slot !== drag.slot) setDrag({ ...drag, slot });
          }}
          onDrop={(e) => {
            if (!drag) return;
            e.preventDefault();
            move(drag.from, drag.slot > drag.from ? drag.slot - 1 : drag.slot);
            setDrag(null);
          }}
          onDragEnd={() => setDrag(null)}
          onKeyDown={(e) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
            e.preventDefault();
            move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
          }}
        >
          <span className="grip" aria-hidden="true">
            ⠿
          </span>
          {l}
        </li>
      ))}
    </ol>
  );
}

/** One variable's name, unit, type and category order. */
export function VariableFields({ v }: { v: Variable }) {
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const edit = (label: string, fn: (x: Variable) => void, merge?: string) =>
    mutate(label, (w) => fn(w.variables.find((x) => x.id === v.id)!), merge);
  const levels = v.type === 'categorical' ? distinctValues(ws, v, Object.keys(ws.samples)).map(String) : [];
  return (
    <div className="variable-fields">
      <label className="field">
        Name
        <input
          type="text"
          value={v.name}
          onChange={(e) => edit('Rename variable', (x) => void (x.name = e.target.value), `vname:${v.id}`)}
        />
      </label>
      <label className="field">
        Unit
        <input
          type="text"
          value={v.unit ?? ''}
          placeholder="e.g. nM"
          onChange={(e) =>
            edit(
              'Change unit',
              (x) => {
                if (e.target.value) x.unit = e.target.value;
                else x.unit = undefined;
              },
              `vunit:${v.id}`,
            )
          }
        />
      </label>
      <label className="field">
        Type
        <select
          value={v.type}
          onChange={(e) => {
            const type = e.target.value as Variable['type'];
            let dropped = 0;
            mutate('Change variable type', (w) => void (dropped = retype(w, v.id, type)));
            if (dropped) toast(`${dropped} value(s) were not numbers and were cleared (undo to restore).`);
          }}
        >
          <option value="numeric">numeric</option>
          <option value="categorical">categorical</option>
        </select>
      </label>
      {v.type === 'categorical' && levels.length > 1 && (
        <div className="field tt-wide">
          Category order
          <LevelOrder v={v} levels={levels} />
        </div>
      )}
    </div>
  );
}
