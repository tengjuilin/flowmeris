import { produce } from 'immer';
import { create } from 'zustand';
import {
  type AppDefaults,
  type AppSettings,
  type DefaultsOverrides,
  type DefaultsSection,
  EMPTY_SETTINGS,
  type Hotkeys,
  applyDefaults,
  hotkeyOverrides,
  readSettings,
  resolveDefaults,
  resolveHotkeys,
  restylePlot,
  restyleWorkspace,
  setDefault,
} from '../lib/settings/index.ts';
import { writeLocal } from './prefs.ts';
import { useStore } from './store.ts';

/**
 * The user's settings (default appearance and hotkeys), kept in this browser's localStorage for every
 * workspace and moved between browsers as a settings file (Settings dialog). The defaults reach the rest
 * of the app through `applyDefaults` (live bindings such as `DEFAULT_STYLE`).
 */

export const SETTINGS_KEY = 'flowmeris.settings';

interface SettingsState {
  /** What the user changed, as stored. */
  settings: AppSettings;
  /** The defaults and hotkeys in use. */
  defaults: AppDefaults;
  hotkeys: Hotkeys;
  /** Counts default changes the open view has not been drawn again with (`redrawViews`). */
  pending: number;
  /** Counts redraws of the open view after default changes: its key, so it is drawn again from scratch. */
  rev: number;
  /** Set default field `key` of section `s` to `v` (undefined unsets an optional color). */
  setDefault: (s: DefaultsSection, key: string, v: unknown) => void;
  /** Put fields (by section; every field when omitted) back on their factory defaults, as one change. */
  resetDefaults: (fields?: readonly (readonly [DefaultsSection, readonly string[]])[]) => void;
  setHotkeys: (keys: Hotkeys) => void;
  /** Replace every setting (an imported file, or a reset to the factory settings). */
  replace: (settings: AppSettings) => void;
  /** Draw the open view again, when defaults changed since it was drawn. */
  redrawViews: () => void;
}

function readStored(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? readSettings(JSON.parse(raw)).settings : EMPTY_SETTINGS;
  } catch {
    return EMPTY_SETTINGS;
  }
}

const initial = readStored();
applyDefaults(resolveDefaults(initial.defaults));

/**
 * Use defaults `next` from now on, and restyle what followed the old ones in the open workspace, as one
 * undo step. A Gate-view plot shown unsaved is restyled with them, and stays unsaved.
 */
function changeDefaults(from: AppDefaults, next: AppDefaults, merge?: string) {
  applyDefaults(next);
  const st = useStore.getState();
  const shown = st.ui.unsavedPlot;
  if (shown) st.setUi({ unsavedPlot: produce(shown, (p) => void restylePlot(p, from, next, false)) });
  st.mutate('Restyle with the new defaults', (ws) => void restyleWorkspace(ws, from, next), merge);
}

export const useSettings = create<SettingsState>()((set, get) => {
  const store = (settings: AppSettings, merge?: string) => {
    const from = get().defaults;
    const defaults = resolveDefaults(settings.defaults);
    const changed = JSON.stringify(settings.defaults) !== JSON.stringify(get().settings.defaults);
    writeLocal(SETTINGS_KEY, settings);
    set((s) => ({
      settings,
      defaults,
      hotkeys: resolveHotkeys(settings.hotkeys),
      pending: changed ? s.pending + 1 : s.pending,
    }));
    if (changed) changeDefaults(from, defaults, merge);
  };
  const withDefaults = (defaults: DefaultsOverrides, merge?: string) =>
    store({ ...get().settings, defaults }, merge);
  return {
    settings: initial,
    defaults: resolveDefaults(initial.defaults),
    hotkeys: resolveHotkeys(initial.hotkeys),
    pending: 0,
    rev: 0,
    setDefault: (s, key, v) =>
      withDefaults(setDefault(get().settings.defaults, s, key, v), `default:${s}.${key}`),
    resetDefaults: (fields) => {
      if (!fields) return withDefaults({});
      // Dropping a field's override puts it back on the factory default.
      const next = { ...get().settings.defaults };
      for (const [s, keys] of fields) {
        const kept = Object.entries(next[s] ?? {}).filter(([k]) => !keys.includes(k));
        if (kept.length) next[s] = Object.fromEntries(kept);
        else delete next[s];
      }
      withDefaults(next);
    },
    setHotkeys: (keys) => store({ ...get().settings, hotkeys: hotkeyOverrides(keys) }),
    replace: (settings) => store(settings),
    redrawViews: () => {
      if (get().pending) set((s) => ({ pending: 0, rev: s.rev + 1 }));
    },
  };
});
