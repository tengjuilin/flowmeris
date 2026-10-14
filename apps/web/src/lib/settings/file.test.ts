import { describe, expect, it } from 'vitest';
import { parseSettingsFile, readSettings, settingsFileText } from './file.ts';

describe('the settings file', () => {
  it('round-trips the settings', () => {
    const settings = {
      defaults: { plot: { pointPx: 4 }, chart: { gridColor: null } },
      hotkeys: { 'tool.rect': ['V'], 'tool.select': [] },
    };
    const text = settingsFileText(settings);
    expect(JSON.parse(text)).toMatchObject({ schema: 'flowmeris.settings', version: 1 });
    expect(parseSettingsFile(text)).toEqual({ settings, dropped: 0 });
  });

  it('refuses a file that is not Flowmeris settings', () => {
    expect(() => parseSettingsFile('not json')).toThrow('not JSON');
    expect(() => parseSettingsFile('{"schema":"flowmeris.workspace"}')).toThrow(
      'not a Flowmeris settings file',
    );
    expect(() => parseSettingsFile('{"schema":"flowmeris.settings","version":99}')).toThrow('newer version');
  });

  it('leaves out unknown actions and invalid keys, and counts them', () => {
    const { settings, dropped } = readSettings({
      hotkeys: { undo: ['Mod+U', 'v', 3], nope: ['X'], redo: 'Mod+R' },
      defaults: { plot: { pointPx: -1 } },
    });
    expect(settings).toEqual({ defaults: {}, hotkeys: { undo: ['Mod+U'] } });
    expect(dropped).toBe(5);
  });

  it('reads missing parts as no changes', () => {
    expect(readSettings({})).toEqual({ settings: { defaults: {}, hotkeys: {} }, dropped: 0 });
    expect(readSettings(null)).toEqual({ settings: { defaults: {}, hotkeys: {} }, dropped: 0 });
  });
});
