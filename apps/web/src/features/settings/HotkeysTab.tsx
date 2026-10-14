import { useEffect, useState } from 'react';
import {
  DEFAULT_HOTKEYS,
  HOTKEY_ACTIONS,
  HOTKEY_SCOPES,
  type HotkeyId,
  comboOf,
  formatCombo,
  hotkeyAction,
  resetHotkey,
  setHotkey,
} from '../../lib/settings/index.ts';
import { useSettings } from '../../state/settings.ts';

const sameKeys = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * The hotkeys, by where they act: each action's keys, with Change (press the new key), Reset and Clear.
 * A key taken from another action is named in a note.
 */
export function HotkeysTab() {
  const keys = useSettings((s) => s.hotkeys);
  const setHotkeys = useSettings((s) => s.setHotkeys);
  const [recording, setRecording] = useState<HotkeyId | null>(null);
  const [note, setNote] = useState('');
  const allDefault = HOTKEY_ACTIONS.every((a) => sameKeys(keys[a.id], DEFAULT_HOTKEYS[a.id]));

  /** Set `id`'s keys to `next`, and say which keys other actions lost to it. */
  const change = (id: HotkeyId, next: typeof keys) => {
    setHotkeys(next);
    setNote(
      HOTKEY_ACTIONS.filter((o) => o.id !== id)
        .flatMap((o) => keys[o.id].filter((c) => !next[o.id].includes(c)).map((c) => [c, o.label] as const))
        .map(([c, from]) => `${formatCombo(c)} moved from ${from} to ${hotkeyAction(id).label}.`)
        .join(' '),
    );
  };

  // While recording, the next key press anywhere is the new key (before the dialog or the app see it, so
  // Escape is recorded rather than closing the dialog). Tab still moves the focus, and stops recording.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return setRecording(null);
      const c = comboOf(e);
      e.preventDefault();
      e.stopPropagation();
      // A modifier alone waits for the key.
      if (c === null) return;
      change(recording, setHotkey(keys, recording, c));
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <>
      <div className="settings-intro">
        <p>
          Click <em>Change</em>, then press the new key or combination. A key used by another action that acts
          at the same time moves to this one; the Plot grid, a selected gate and a polygon being drawn may
          share keys, as only one of them takes a key at a time. Ctrl on Windows and Linux is ⌘ on a Mac, so
          hotkeys (and settings files) work on both. Tab always moves the focus.
        </p>
        <button
          type="button"
          disabled={allDefault}
          onClick={() => {
            setHotkeys(DEFAULT_HOTKEYS);
            setNote('');
          }}
        >
          Reset all hotkeys
        </button>
      </div>
      <output className="settings-note" aria-live="polite">
        {note}
      </output>
      {HOTKEY_SCOPES.map((scope) => (
        <fieldset key={scope.id} className="settings-group">
          <legend>{scope.title}</legend>
          {scope.note && <p className="small muted settings-group-note">{scope.note}</p>}
          {HOTKEY_ACTIONS.filter((a) => a.scope === scope.id).map((a) => {
            const rec = recording === a.id;
            return (
              <div key={a.id} className="hotkey-row">
                <span id={`hotkey-${a.id}`}>{a.label}</span>
                <span className="hotkey-keys" aria-label={`${a.label} keys`}>
                  {keys[a.id].length === 0 && <span className="muted">None</span>}
                  {keys[a.id].map((c) => (
                    <kbd key={c}>{formatCombo(c)}</kbd>
                  ))}
                </span>
                <span className="hotkey-actions">
                  <button
                    type="button"
                    className={rec ? 'primary' : ''}
                    aria-describedby={`hotkey-${a.id}`}
                    aria-label={rec ? `Press the new key for ${a.label}` : `Change ${a.label}`}
                    data-recording={rec || undefined}
                    onClick={() => setRecording(rec ? null : a.id)}
                  >
                    {rec ? 'Press a key…' : 'Change'}
                  </button>
                  <button
                    type="button"
                    disabled={sameKeys(keys[a.id], a.keys)}
                    aria-label={`Reset ${a.label}`}
                    onClick={() => change(a.id, resetHotkey(keys, a.id))}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    disabled={keys[a.id].length === 0}
                    aria-label={`Clear ${a.label}`}
                    onClick={() => {
                      setHotkeys({ ...keys, [a.id]: [] });
                      setNote('');
                    }}
                  >
                    Clear
                  </button>
                </span>
              </div>
            );
          })}
        </fieldset>
      ))}
    </>
  );
}
