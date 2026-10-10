import type { Group } from '@flowmeris/model';
import { useEffect } from 'react';
import { clipCell, pasteCell, removeCell } from '../../state/commands/grid.ts';
import { useStore } from '../../state/store.ts';

type GridKey = 'delete' | 'cut' | 'copy' | 'paste' | 'escape';

/** The grid action of a key press: ⌘ (Ctrl on Windows and Linux) with X, C or V, Delete or Backspace, Escape. */
function gridKey(e: KeyboardEvent): GridKey | null {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey && !e.shiftKey)
    return ({ x: 'cut', c: 'copy', v: 'paste' } as const)[e.key.toLowerCase()] ?? null;
  if (mod || e.altKey) return null;
  if (e.key === 'Delete' || e.key === 'Backspace') return 'delete';
  return e.key === 'Escape' ? 'escape' : null;
}

/** Whether a key goes to a text field or a menu rather than to the grid. */
function inField(t: EventTarget | null) {
  return (
    t instanceof Element && !!t.closest('input, select, textarea, [contenteditable="true"], [role="dialog"]')
  );
}

/** Run grid action `key` on group `g`; returns whether it acted (and the key's default is to be prevented). */
function runGridKey(key: GridKey, g: Group): boolean {
  const { ui: u, setUi } = useStore.getState();
  const slot = g.grid.cells.findIndex((c) => !!c && c.id === u.gridCellId);
  const cell = g.grid.cells[slot];
  switch (key) {
    case 'escape':
      if (u.gridClip?.cut) setUi({ gridClip: null });
      return false;
    case 'delete':
      if (u.tool !== 'select' || u.selectedGateId || !cell) return false;
      removeCell(g.id, cell.id);
      setUi({ gridCellId: null });
      return true;
    case 'cut':
    case 'copy':
      // Selected text is copied as text.
      if (!cell || window.getSelection()?.isCollapsed === false) return false;
      clipCell(g, cell.id, key === 'cut');
      return true;
    case 'paste': {
      const to = cell ? slot : u.gridSlot;
      if (to === null || !u.gridClip) return false;
      pasteCell(g, to);
      return true;
    }
  }
}

/**
 * The Plot view's keys, none of which act in a text field or menu:
 * - Delete (or Backspace) removes the selected plot, unless a gate is selected (then it removes the
 *   gate) or a polygon is being drawn;
 * - ⌘X / ⌘C cut or copy the selected plot, unless text is selected;
 * - ⌘V pastes it into the selected plot's slot (replacing that plot) or the selected empty slot;
 * - Escape cancels a cut.
 */
export function useGridKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = gridKey(e);
      if (!key || inField(e.target)) return;
      const { ui, ws } = useStore.getState();
      const g = ws.groups.find((x) => x.id === ui.groupId);
      if (g && runGridKey(key, g)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
