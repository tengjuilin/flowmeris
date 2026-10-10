import { useEffect } from 'react';
import { type Tool, useStore } from '../state/store.ts';
import { VIEW_DEFS } from './views.tsx';

/** Gate tool shortcuts, in views whose definition has `toolKeys`. */
const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  r: 'rect',
  e: 'ellipse',
  p: 'polygon',
  q: 'quadrant',
  s: 'spider',
  h: 'range',
  b: 'split',
};

/**
 * The app's keyboard shortcuts: ⌘Z / ⇧⌘Z undo and redo, Alt+← / Alt+→ Back and Forward, the gate tool
 * keys, and Escape (passed to `onEscape`, e.g. to close the settings drawer). None act while typing in a
 * field, except Escape.
 */
export function useHotkeys(onEscape?: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) onEscape();
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      const st = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (e.altKey && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        st.navigate(e.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool && VIEW_DEFS[st.ui.view].toolKeys) st.setUi({ tool });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
}
