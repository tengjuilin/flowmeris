import { type DefaultsOverrides, readDefaultsOverrides } from './defaults.ts';
import { type HotkeyOverrides, isCombo, isHotkeyId } from './hotkeys.ts';

/** The user's settings: default appearance and hotkeys, each only where changed from the factory ones. */
export interface AppSettings {
  defaults: DefaultsOverrides;
  hotkeys: HotkeyOverrides;
}

export const EMPTY_SETTINGS: AppSettings = { defaults: {}, hotkeys: {} };

export const SETTINGS_SCHEMA = 'flowmeris.settings';
export const SETTINGS_VERSION = 1;

/** Hotkey overrides read from untrusted JSON: known actions with valid keys; `dropped` counts the others. */
export function readHotkeyOverrides(raw: unknown): { overrides: HotkeyOverrides; dropped: number } {
  const overrides: HotkeyOverrides = {};
  let dropped = 0;
  if (!raw || typeof raw !== 'object') return { overrides, dropped: raw === undefined ? 0 : 1 };
  for (const [id, keys] of Object.entries(raw)) {
    if (!isHotkeyId(id) || !Array.isArray(keys)) {
      dropped++;
      continue;
    }
    const valid = keys.filter((k): k is string => typeof k === 'string' && isCombo(k));
    dropped += keys.length - valid.length;
    overrides[id] = [...new Set(valid)];
  }
  return { overrides, dropped };
}

/** Settings read from untrusted JSON: what is valid is kept, `dropped` counts the rest. */
export function readSettings(raw: unknown): { settings: AppSettings; dropped: number } {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = readDefaultsOverrides(r.defaults);
  const h = readHotkeyOverrides(r.hotkeys);
  return { settings: { defaults: d.overrides, hotkeys: h.overrides }, dropped: d.dropped + h.dropped };
}

/** The settings file's text. */
export function settingsFileText(s: AppSettings): string {
  return `${JSON.stringify(
    { schema: SETTINGS_SCHEMA, version: SETTINGS_VERSION, defaults: s.defaults, hotkeys: s.hotkeys },
    null,
    2,
  )}\n`;
}

/**
 * The settings in a settings file's text. Throws an Error with a message for the user when the text is
 * not a Flowmeris settings file.
 */
export function parseSettingsFile(text: string): { settings: AppSettings; dropped: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The file is not JSON.');
  }
  const r = raw as { schema?: unknown; version?: unknown } | null;
  if (!r || typeof r !== 'object' || r.schema !== SETTINGS_SCHEMA)
    throw new Error('The file is not a Flowmeris settings file.');
  if (typeof r.version !== 'number' || r.version > SETTINGS_VERSION)
    throw new Error('The settings file is from a newer version of Flowmeris.');
  return readSettings(raw);
}
