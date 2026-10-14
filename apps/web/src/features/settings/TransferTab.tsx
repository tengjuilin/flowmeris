import { useRef, useState } from 'react';
import { ExportIcon, ImportIcon } from '../../components/ui/icons.tsx';
import { download } from '../../lib/download.ts';
import { EMPTY_SETTINGS, parseSettingsFile, settingsFileText } from '../../lib/settings/index.ts';
import { useSettings } from '../../state/settings.ts';

export const SETTINGS_FILE_NAME = 'flowmeris-settings.json';

/** Export the settings to a file, import them from one, or go back to the factory settings. */
export function TransferTab() {
  const settings = useSettings((s) => s.settings);
  const replace = useSettings((s) => s.replace);
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const factory = Object.keys(settings.defaults).length === 0 && Object.keys(settings.hotkeys).length === 0;

  const importFile = async (f: File) => {
    try {
      const { settings: s, dropped } = parseSettingsFile(await f.text());
      replace(s);
      setMessage({
        text: dropped
          ? `Imported ${f.name}; ${dropped} unknown or invalid setting(s) were left out.`
          : `Imported ${f.name}.`,
      });
    } catch (e) {
      setMessage({ text: `Could not import ${f.name}: ${(e as Error).message}`, error: true });
    }
  };

  return (
    <>
      <div className="settings-intro">
        <p>
          Settings are kept in this browser and used by every workspace; workspace files do not carry them.
          Export them to a file to use them in another browser or on another computer, or to share them.
          Importing a file replaces every setting.
        </p>
      </div>
      <fieldset className="settings-group">
        <legend>Settings file</legend>
        <div className="settings-actions">
          <button
            type="button"
            className="icon-text"
            onClick={() => download(SETTINGS_FILE_NAME, settingsFileText(settings), 'application/json')}
          >
            <ExportIcon />
            Export settings…
          </button>
          <button type="button" className="icon-text" onClick={() => input.current?.click()}>
            <ImportIcon />
            Import settings…
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="settings-file-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
        {message && (
          <p className={message.error ? 'danger-text' : 'muted'} role={message.error ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
      </fieldset>
      <fieldset className="settings-group">
        <legend>Factory settings</legend>
        <p className="muted">Default appearance and hotkeys as Flowmeris ships them.</p>
        <div className="settings-actions">
          <button
            type="button"
            className="danger"
            disabled={factory}
            onClick={() => {
              if (confirm('Reset every default and hotkey to the factory settings?')) {
                replace(EMPTY_SETTINGS);
                setMessage({ text: 'Every setting is back on its factory value.' });
              }
            }}
          >
            Reset all settings
          </button>
        </div>
      </fieldset>
    </>
  );
}
