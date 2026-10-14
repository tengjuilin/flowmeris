import type { Group } from '@flowmeris/model';
import { useEffect } from 'react';
import { type HotkeyId, matchHotkey } from '../../lib/settings/index.ts';
import { clipCell, pasteCell, removeCell } from '../../state/commands/grid.ts';
import { useSettings } from '../../state/settings.ts';
import { useStore } from '../../state/store.ts';

type GridKey = 'delete' | 'cut' | 'copy' | 'paste' | 'escape';

const GRID_KEYS = {
  'grid.cut': 'cut',
  'grid.copy': 'copy',
  'grid.paste': 'paste',
  'grid.delete': 'delete',
  'grid.cancelCut': 'escape',
} as const satisfies Partial<Record<HotkeyId, GridKey>>;
const GRID_IDS = Object.keys(GRID_KEYS) as (keyof typeof GRID_KEYS)[];

/** The grid action of a key press, with the keys set in the Settings dialog. */
function gridKey(e: KeyboardEvent): GridKey | null {
  const id = matchHotkey(useSettings.getState().hotkeys, GRID_IDS, e);
  return id ? GRID_KEYS[id] : null;
}

/** Whether a key goes to a text field or a menu rather than to the grid. */
function inField(t: EventTarget | null) {
  return (
    t instanceof Element &&
    !!t.closest('input, select, textarea, [contenteditable="true"], [role="dialog"], dialog')
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
 * The Plot view's keys (by default; set in the Settings dialog), none of which act in a text field or menu:
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
