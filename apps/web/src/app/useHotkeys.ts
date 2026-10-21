import { useEffect } from 'react';
import { type HotkeyId, matchHotkey } from '../lib/settings/index.ts';
import { useSettings } from '../state/settings.ts';
import { type Tool, useStore } from '../state/store.ts';
import { VIEW_DEFS } from './views.tsx';

/** Gate tool shortcuts, in views whose definition has `toolKeys`. */
const TOOL_KEYS = {
  'tool.select': 'select',
  'tool.rect': 'rect',
  'tool.ellipse': 'ellipse',
  'tool.polygon': 'polygon',
  'tool.quadrant': 'quadrant',
  'tool.spider': 'spider',
  'tool.curly': 'curly',
  'tool.range': 'range',
  'tool.split': 'split',
} as const satisfies Partial<Record<HotkeyId, Tool>>;

const GENERAL = ['undo', 'redo', 'back', 'forward'] as const;
const TOOLS = Object.keys(TOOL_KEYS) as (keyof typeof TOOL_KEYS)[];

/** Whether a key goes to a text field or a dialog rather than to the app. */
const inField = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, select, textarea, [contenteditable="true"], dialog');

/** Run the app shortcut that key press `e` gives, if any. */
function runHotkey(e: KeyboardEvent) {
  if (inField(e.target)) return;
  const st = useStore.getState();
  const keys = useSettings.getState().hotkeys;
  const general = matchHotkey(keys, GENERAL, e);
  if (general) {
    e.preventDefault();
    if (general === 'undo') st.undo();
    else if (general === 'redo') st.redo();
    else st.navigate(general === 'back' ? -1 : 1);
    return;
  }
  const tool = matchHotkey(keys, TOOLS, e);
  if (tool && VIEW_DEFS[st.ui.view].toolKeys) st.setUi({ tool: TOOL_KEYS[tool] });
}

/**
 * The app's keyboard shortcuts, with the keys set in the Settings dialog: undo and redo, Back and
 * Forward, the gate tool keys, and Escape (passed to `onEscape`, e.g. to close the settings drawer). None
 * act while typing in a field or in a dialog, except Escape.
 */
export function useHotkeys(onEscape?: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) onEscape();
      runHotkey(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
}
