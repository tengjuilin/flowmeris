import type { PlotCell } from '@flowmeris/model';
import { useState } from 'react';
import { type DropSide, dropSide } from '../../lib/gridMove.ts';
import { moveCell } from '../../state/commands/grid.ts';

const MIME = 'application/x-flowmeris-grid-slot';

/**
 * Dragging grid plots by their titles onto other slots: on a plot's left or right half to put the dragged
 * plot before or after it, or into an empty slot (`moveCell`).
 */
export function useGridDrag(groupId: string, cells: (PlotCell | null)[]) {
  const [from, setFrom] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ slot: number; side: DropSide } | null>(null);
  const end = () => {
    setFrom(null);
    setDrop(null);
  };
  const sideAt = (e: React.DragEvent<HTMLElement>, slot: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    return dropSide(!!cells[slot], e.clientX, r.left, r.width);
  };

  /** Props of the title of the plot in slot `slot`: its drag handle. */
  const handle = (slot: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(MIME, String(slot));
      // The whole plot follows the pointer, not only its title.
      const cell = e.currentTarget.closest('.grid-cell');
      if (cell) {
        const r = cell.getBoundingClientRect();
        e.dataTransfer.setDragImage(cell, e.clientX - r.left, e.clientY - r.top);
      }
      setFrom(slot);
    },
    onDragEnd: end,
  });

  /** Props of slot `slot` (a plot or an empty slot) as a place to drop a dragged plot. */
  const target = (slot: number) => ({
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (from === null || !e.dataTransfer.types.includes(MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const side = sideAt(e, slot);
      if (drop?.slot !== slot || drop.side !== side) setDrop({ slot, side });
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null))
        setDrop((d) => (d?.slot === slot ? null : d));
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (from !== null && from !== slot) moveCell(groupId, from, slot, sideAt(e, slot));
      end();
    },
  });

  /** Classes of slot `slot` while a plot is dragged: the dragged plot, and where it would go. */
  const dragClass = (slot: number) =>
    (from === slot ? ' dragging' : '') + (drop?.slot === slot && from !== slot ? ` drop-${drop.side}` : '');

  return { handle, target, dragClass };
}
